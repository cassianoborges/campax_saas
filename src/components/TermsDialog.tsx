import { ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { CURRENT_TERMS_TEXT } from '@/config/terms';

interface TermsDialogProps {
    trigger: ReactNode;
}

export function TermsDialog({ trigger }: TermsDialogProps) {
    return (
        <Dialog>
            <DialogTrigger asChild>{trigger}</DialogTrigger>
            <DialogContent className="flex max-h-[85vh] w-[calc(100%-2rem)] max-w-2xl flex-col">
                <DialogHeader>
                    <DialogTitle className="font-heading text-navy dark:text-gold-light">
                        Termos de Uso e Política de Privacidade de Imagem
                    </DialogTitle>
                    <DialogDescription className="sr-only">
                        Texto completo dos Termos de Uso e Política de Privacidade de Imagem da Campax
                    </DialogDescription>
                </DialogHeader>
                <div className="-mr-6 overflow-y-auto pr-6">
                    <div
                        className="prose prose-sm dark:prose-invert max-w-none
                            prose-headings:font-heading prose-headings:text-navy dark:prose-headings:text-gold-light
                            prose-h1:hidden
                            prose-strong:text-foreground
                            prose-a:text-gold prose-a:no-underline hover:prose-a:underline
                            prose-hr:border-border
                            prose-blockquote:border-l-gold prose-blockquote:text-foreground prose-blockquote:not-italic
                            prose-li:marker:text-gold"
                    >
                        <ReactMarkdown>{CURRENT_TERMS_TEXT}</ReactMarkdown>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
