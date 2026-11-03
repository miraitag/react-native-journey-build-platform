import { parseProject, type Files } from '@rnjb/codegen';
import { extractManifest, type ExtractOptions } from '@rnjb/manifest-extractor';
import type { ProfilePack } from '@rnjb/pack-schema';

/** CPU-heavy code analysis (§5.2); runs in the analysis worker, see `off-thread.ts`. */
export const analysisTasks = {
  parseProject: (input: { files: Files; profile: ProfilePack }) =>
    parseProject(input.files, input.profile),
  extractManifest: (input: { root: string; options: ExtractOptions }) =>
    extractManifest(input.root, input.options),
};

export type AnalysisTasks = typeof analysisTasks;
