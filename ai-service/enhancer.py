import sys
import os
import cv2
import torch
import numpy as np
import traceback

# Add CodeFormer to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), 'CodeFormer')))

try:
    from torchvision.transforms.functional import normalize
    from basicsr.utils import img2tensor, tensor2img
    from facexlib.utils.face_restoration_helper import FaceRestoreHelper
    from models.codeformer import CodeFormer
    CODEFORMER_AVAILABLE = True
except ImportError as e:
    print(f"Warning: CodeFormer dependencies not fully installed. Error: {e}")
    print("Falling back to mock enhancer.")
    CODEFORMER_AVAILABLE = False


def _beautify(img_bgr):
    """
    Post-processing pipeline to make images look attractive:
    1. Bilateral filter   → smooth skin while preserving edges
    2. CLAHE              → adaptive contrast enhancement per channel
    3. Unsharp mask       → sharpen fine details (eyes, hair, lips)
    4. Saturation boost   → richer, more vibrant colors
    5. Brightness/gamma   → subtle luminance lift
    """
    # ── 1. Gentle skin smoothing (preserves edges, removes noise) ──────────
    smooth = cv2.bilateralFilter(img_bgr, d=9, sigmaColor=35, sigmaSpace=35)

    # ── 2. CLAHE contrast enhancement on Luminance channel ─────────────────
    lab = cv2.cvtColor(smooth, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    l = clahe.apply(l)
    lab = cv2.merge([l, a, b])
    contrast_img = cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)

    # ── 3. Unsharp masking for crisp details ───────────────────────────────
    gaussian = cv2.GaussianBlur(contrast_img, (0, 0), sigmaX=2.5)
    sharp = cv2.addWeighted(contrast_img, 1.55, gaussian, -0.55, 0)

    # ── 4. Saturation boost in HSV ─────────────────────────────────────────
    hsv = cv2.cvtColor(sharp, cv2.COLOR_BGR2HSV).astype(np.float32)
    hsv[:, :, 1] = np.clip(hsv[:, :, 1] * 1.25, 0, 255)   # +25% saturation
    hsv[:, :, 2] = np.clip(hsv[:, :, 2] * 1.05, 0, 255)   # +5% brightness
    vibrant = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2BGR)

    # ── 5. Gentle gamma lift (makes image look brighter & fresher) ──────────
    gamma = 0.92
    lut = np.array([((i / 255.0) ** gamma) * 255 for i in range(256)], dtype=np.uint8)
    final = cv2.LUT(vibrant, lut)

    return final


class FaceEnhancer:
    def __init__(self):
        if not CODEFORMER_AVAILABLE:
            self.mock_mode = True
            return

        self.mock_mode = False

        # Device selection: MPS (Apple Silicon) → CUDA → CPU
        if torch.backends.mps.is_available():
            self.device = torch.device('mps')
        elif torch.cuda.is_available():
            self.device = torch.device('cuda')
        else:
            self.device = torch.device('cpu')

        print(f"Using device: {self.device}")

        self.codeformer_net = None
        self.face_helper = None
        self._load_models()

    def _load_models(self):
        codeformer_model_path = 'CodeFormer/weights/CodeFormer/codeformer.pth'

        if not os.path.exists(codeformer_model_path):
            print(f"Model not found at {codeformer_model_path}. Please run setup.sh. Operating in MOCK mode.")
            self.mock_mode = True
            return

        try:
            self.codeformer_net = CodeFormer(
                dim_embd=512, codebook_size=1024, n_head=8, n_layers=9,
                connect_list=['32', '32', '32']
            ).to(self.device)
            checkpoint = torch.load(codeformer_model_path, map_location=self.device)['params_ema']
            self.codeformer_net.load_state_dict(checkpoint)
            self.codeformer_net.eval()

            # FaceRestoreHelper on CPU to avoid MPS op incompatibilities
            self.face_helper = FaceRestoreHelper(
                1, face_size=512, crop_ratio=(1, 1),
                det_model='retinaface_resnet50',
                save_ext='png', use_parse=True,
                device=torch.device('cpu')
            )
        except Exception as e:
            print(f"Error loading models: {e}")
            traceback.print_exc()
            print("Operating in MOCK mode.")
            self.mock_mode = True

    def enhance(self, img_np, fidelity_weight=0.5, skip_beautify=False):
        """
        fidelity_weight controls the CodeFormer balance:
          0.5 → best blend of AI sharpening + original identity (recommended)
          0.3 → more aggressive AI enhancement
          0.7 → stay closer to original (safe for portraits)
        Post-processing _beautify() runs regardless.
        """
        # ── Mock mode: apply full beautify pipeline even without CodeFormer ──
        if self.mock_mode:
            print("Running in Mock Mode: returning image")
            return _beautify(img_np) if not skip_beautify else img_np

        if self.codeformer_net is None or self.face_helper is None:
            raise RuntimeError("Models not loaded properly.")

        self.face_helper.clean_all()
        self.face_helper.read_image(img_np)

        num_det_faces = self.face_helper.get_face_landmarks_5(
            only_center_face=False, resize=640, eye_dist_threshold=5
        )

        if num_det_faces == 0:
            print("No face detected – applying beautify to whole image.")
            return _beautify(img_np)

        self.face_helper.align_warp_face()

        for cropped_face in self.face_helper.cropped_faces:
            cropped_face_t = img2tensor(cropped_face / 255., bgr2rgb=True, float32=True)
            normalize(cropped_face_t, (0.5, 0.5, 0.5), (0.5, 0.5, 0.5), inplace=True)
            cropped_face_t = cropped_face_t.unsqueeze(0).to(self.device)

            try:
                with torch.no_grad():
                    output = self.codeformer_net(cropped_face_t, w=fidelity_weight, adain=True)[0]
                    restored_face = tensor2img(output, rgb2bgr=True, min_max=(-1, 1))
                del output
                if torch.backends.mps.is_available():
                    torch.mps.empty_cache()
                elif torch.cuda.is_available():
                    torch.cuda.empty_cache()
            except Exception as e:
                print(f"Inference error: {e}")
                traceback.print_exc()
                restored_face = cropped_face

            self.face_helper.add_restored_face(restored_face)

        self.face_helper.get_inverse_affine(None)
        restored_img = self.face_helper.paste_faces_to_input_image()

        # ── Apply beauty pipeline on top of CodeFormer output ───────────────
        return _beautify(restored_img) if not skip_beautify else restored_img
