import { DRACOLoader, GLTFLoader, MeshoptDecoder } from 'three-stdlib';
import { preload, suspend } from 'suspend-react';

const DEFAULT_DRACO_DECODER_PATH = '/draco/';
const loggedCompressedModels = new Set<string>();

type DracoPathOption = string | false;
type CacheKey = [string, DracoPathOption];
type LoadedGLTF = Awaited<ReturnType<GLTFLoader['loadAsync']>>;

interface GLTFFallbackOptions {
  dracoPath?: DracoPathOption;
}

type UseGLTFWithFallback = ((modelUrl: string, options?: GLTFFallbackOptions) => LoadedGLTF) & {
  preload: (modelUrl: string, options?: GLTFFallbackOptions) => void;
};

const dracoLoaders = new Map<string, DRACOLoader>();

function getDracoLoader(decoderPath: string): DRACOLoader {
  let loader = dracoLoaders.get(decoderPath);
  if (!loader) {
    loader = new DRACOLoader();
    loader.setDecoderPath(decoderPath);
    dracoLoaders.set(decoderPath, loader);
  }
  return loader;
}

function resolveDracoPath(options?: GLTFFallbackOptions): DracoPathOption {
  return options?.dracoPath === false ? false : options?.dracoPath ?? DEFAULT_DRACO_DECODER_PATH;
}

function buildCacheKey(modelUrl: string, options?: GLTFFallbackOptions): CacheKey {
  return [modelUrl, resolveDracoPath(options)];
}

function appendCompressionSuffix(modelUrl: string, suffix: '.br' | '.gz'): string {
  const searchOrHashIndex = modelUrl.search(/[?#]/);
  if (searchOrHashIndex === -1) {
    return `${modelUrl}${suffix}`;
  }

  const pathname = modelUrl.slice(0, searchOrHashIndex);
  const tail = modelUrl.slice(searchOrHashIndex);
  return `${pathname}${suffix}${tail}`;
}

function buildCandidateUrls(modelUrl: string): string[] {
  return [
    appendCompressionSuffix(modelUrl, '.br'),
    appendCompressionSuffix(modelUrl, '.gz'),
    modelUrl,
  ];
}

function formatAttemptError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'object' && error && 'type' in error && typeof error.type === 'string') {
    return error.type;
  }
  return String(error);
}

function createLoader(dracoPath: DracoPathOption): GLTFLoader {
  const loader = new GLTFLoader();

  if (dracoPath !== false) {
    loader.setDRACOLoader(getDracoLoader(dracoPath));
  }

  loader.setMeshoptDecoder(typeof MeshoptDecoder === 'function' ? MeshoptDecoder() : MeshoptDecoder);
  return loader;
}

async function loadGLTFWithFallback(modelUrl: string, dracoPath: DracoPathOption): Promise<LoadedGLTF> {
  const loader = createLoader(dracoPath);
  const attempts: string[] = [];

  for (const candidateUrl of buildCandidateUrls(modelUrl)) {
    try {
      const gltf = await loader.loadAsync(candidateUrl);

      if (import.meta.env.DEV && candidateUrl !== modelUrl && !loggedCompressedModels.has(modelUrl)) {
        loggedCompressedModels.add(modelUrl);
        console.info(`[model-loader] using compressed asset: ${candidateUrl}`);
      }

      return gltf;
    } catch (error) {
      attempts.push(`${candidateUrl} (${formatAttemptError(error)})`);
    }
  }

  throw new Error(`Failed to load model "${modelUrl}". Tried: ${attempts.join(' -> ')}`);
}

export const useGLTFWithFallback = ((modelUrl: string, options?: GLTFFallbackOptions) =>
  suspend(loadGLTFWithFallback, buildCacheKey(modelUrl, options))) as UseGLTFWithFallback;

useGLTFWithFallback.preload = (modelUrl: string, options?: GLTFFallbackOptions): void => {
  preload(loadGLTFWithFallback, buildCacheKey(modelUrl, options));
};
