import { getCamerasWithLegacyPaths, updateCameraUrls, closePool } from '../db';
import { mediamtxAPI } from '../mediamtx-api';
import { generatePathName, MANAGED_PATH } from '../paths';

// One-off (spec 06, A2): replaces guessable legacy path names ("santana", "uruacu"...) with
// `<empresa slug>-<random>`. For each camera: create the new path, point the DB (mediamtx_path,
// webrtc_url) at it, then delete the old path. Public pages read webrtc_url from the DB on every
// load, so they pick up the new address by themselves; viewers watching at that moment lose the
// image until they reload — run it with no velório live.
//
//   npm run rotate-paths            (dry run)
//   npm run rotate-paths -- --apply

async function main() {
    const apply = process.argv.includes('--apply');
    const cameras = await getCamerasWithLegacyPaths(MANAGED_PATH);
    const existing = new Set((await mediamtxAPI.listConfigPaths()).map((p) => p.name));
    console.log(`${cameras.length} câmera(s) com nome antigo${apply ? '' : ' — simulação, use --apply para aplicar'}`);

    for (const camera of cameras) {
        const oldName = camera.mediamtx_path!;
        const newName = generatePathName(camera.empresa_slug);
        const live = camera.ativo && camera.empresa_ativa;
        console.log(`• ${camera.nome}: ${oldName} → ${newName}${live ? '' : ' (inativa: só no banco)'}`);
        if (!apply) continue;

        if (live) await mediamtxAPI.addPath(newName, camera.rtsp_url);
        await updateCameraUrls(camera.id, newName, mediamtxAPI.getWebRTCUrl(newName));
        if (existing.has(oldName)) await mediamtxAPI.deletePath(oldName);
    }
}

main()
    .catch((error) => {
        console.error(`✗ ${error.response?.data?.error ?? error.message}`);
        process.exitCode = 1;
    })
    .finally(closePool);
