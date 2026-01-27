// src/composables/usePromptDiff.ts
import { ref, computed } from "vue";
import DiffMatchPatch from "diff-match-patch";

export function usePromptDiff(originalText: string, newText: string) {
  const dmp = new DiffMatchPatch();

  // Computa os diffs brutos
  const rawDiffs = computed(() => {
    const diff = dmp.diff_main(originalText, newText);
    dmp.diff_cleanupSemantic(diff);
    return diff;
  });

  // Gera HTML seguro se você quiser renderizar fora do v-for (opcional)
  const diffHtml = computed(() => {
    return dmp.diff_prettyHtml(rawDiffs.value);
  });

  return {
    rawDiffs,
    diffHtml,
  };
}
