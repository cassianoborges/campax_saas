import { randomInt } from 'crypto';

// MediaMTX path names are `<empresa slug>-<10 random [a-z0-9]>`: no collision between funerárias
// (prefix + UNIQUE on cameras.mediamtx_path) and impossible to guess (36^10), unlike the old
// names derived from the camera name ("santana", "uruacu"...). Generated once and stored — renaming
// a camera never changes its address.
const RANDOM_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';
const RANDOM_LENGTH = 10;

/** Paths this service created and therefore may delete. Anything else (all_others, manual config) is left alone. */
export const MANAGED_PATH = new RegExp(`^[a-z0-9]+(?:-[a-z0-9]+)*-[a-z0-9]{${RANDOM_LENGTH}}$`);

export function generatePathName(empresaSlug: string): string {
    const suffix = Array.from({ length: RANDOM_LENGTH }, () => RANDOM_CHARS[randomInt(RANDOM_CHARS.length)]).join('');
    return `${empresaSlug}-${suffix}`;
}
