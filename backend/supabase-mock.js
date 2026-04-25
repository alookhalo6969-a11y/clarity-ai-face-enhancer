
const createClient = (url, key) => {
    console.warn('USING SUPABASE MOCK - DATABASE OPERATIONS WILL NOT BE PERSISTED');
    return {
        auth: {
            signUp: async (creds) => ({ data: { user: { id: 'mock-user-id', email: creds.email } }, error: null }),
            signInWithPassword: async (creds) => ({ data: { user: { id: 'mock-user-id', email: creds.email }, session: { access_token: 'mock-token' } }, error: null }),
            signOut: async () => ({ error: null }),
            getUser: async (token) => ({ data: { user: { id: 'mock-user-id', email: 'mock@example.com' } }, error: null })
        },
        from: (table) => ({
            select: () => ({
                eq: () => ({
                    order: () => ({
                        data: [],
                        error: null,
                        then: (cb) => cb({ data: [], error: null })
                    })
                }),
                then: (cb) => cb({ data: [], error: null })
            }),
            insert: () => ({
                then: (cb) => cb({ error: null })
            })
        })
    };
};

module.exports = { createClient };
