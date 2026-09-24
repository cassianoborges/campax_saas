/** Public fields of a funeral home (empresa), as returned by /auth/me and the public endpoints. */
export interface EmpresaPublica {
    id: string;
    nome_exibicao: string;
    slug: string;
    hash_publico: string;
    logo_url: string | null;
    cor_primaria: string | null;
    cor_secundaria: string | null;
    whatsapp_contato: string | null;
    email_contato: string | null;
}
