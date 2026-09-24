const VISITOR_KEY = 'campax_visitor';

export interface SavedVisitor {
  nome: string;
  celular: string;
  email: string;
}

export function getSavedVisitor(): SavedVisitor | null {
  try {
    const raw = localStorage.getItem(VISITOR_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveVisitor(data: SavedVisitor): void {
  localStorage.setItem(VISITOR_KEY, JSON.stringify(data));
}
