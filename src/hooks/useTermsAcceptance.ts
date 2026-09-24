import { useMutation } from '@tanstack/react-query';
import { recordTermsAcceptance, RecordTermsAcceptanceInput } from '@/services/termsAcceptanceService';

export function useRecordTermsAcceptance() {
    return useMutation({
        mutationFn: (input: RecordTermsAcceptanceInput) => recordTermsAcceptance(input),
    });
}
