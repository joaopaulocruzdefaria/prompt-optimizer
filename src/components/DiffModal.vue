<script setup lang="ts">
  import { computed, ref, watch, nextTick } from "vue";
  import { Check, X, GitCompare, RotateCcw, ArrowDown } from "lucide-vue-next";
  import DiffMatchPatch from "diff-match-patch";

  const props = defineProps<{
    isOpen: boolean;
    originalText: string;
    newText: string;
  }>();

  const emit = defineEmits<{
    (e: "close"): void;
    (e: "accept", content: string): void;
  }>();

  // --- Definição dos Blocos ---
  interface DiffBlock {
    id: number;
    type: "equal" | "change";
    oldText: string;
    newText: string;
    status: "pending" | "accepted" | "rejected";
    inlineDiffs?: Array<[number, string]>;
  }

  const blocks = ref<DiffBlock[]>([]);

  // --- Função de Truncamento Inteligente ---
  const formatContext = (text: string, type: number, index: number, total: number) => {
    // Se for uma mudança ou texto curto, mostra tudo
    if (type !== 0 || text.length < 100) return text;

    // Lógica de truncamento para contextos longos
    if (index === 0) {
      return "... " + text.slice(-50);
    } else if (index === total - 1) {
      return text.slice(0, 50) + " ...";
    } else {
      return text.slice(0, 30) + " ... " + text.slice(-30);
    }
  };

  const calculateInlineDiff = (text1: string, text2: string) => {
    const dmp = new DiffMatchPatch();
    const diff = dmp.diff_main(text1, text2);
    dmp.diff_cleanupSemantic(diff);
    return diff;
  };

  // --- Lógica Principal ---
  const computeBlocks = () => {
    if (!props.originalText || !props.newText) return;

    const dmp = new DiffMatchPatch();

    const a = dmp.diff_linesToChars_(props.originalText, props.newText);
    const diffs = dmp.diff_main(a.chars1, a.chars2, false);
    dmp.diff_charsToLines_(diffs, a.lineArray);
    dmp.diff_cleanupSemantic(diffs);

    const newBlocks: DiffBlock[] = [];
    let currentId = 0;

    for (let i = 0; i < diffs.length; i++) {
      const [type, text] = diffs[i]!;

      if (type === 0) {
        newBlocks.push({
          id: currentId++,
          type: "equal",
          oldText: text,
          newText: text,
          status: "accepted",
        });
      } else {
        let blockOld = "";
        let blockNew = "";

        const nextDiff = diffs[i + 1];

        if (type === -1) {
          blockOld = text;
          if (nextDiff && nextDiff[0] === 1) {
            blockNew = nextDiff[1];
            i++;
          }
        } else if (type === 1) {
          blockNew = text;
        }

        const inlineDiffs = calculateInlineDiff(blockOld, blockNew);

        newBlocks.push({
          id: currentId++,
          type: "change",
          oldText: blockOld,
          newText: blockNew,
          status: "pending",
          inlineDiffs: inlineDiffs,
        });
      }
    }

    blocks.value = newBlocks;
  };

  watch(
    [() => props.isOpen, () => props.newText],
    async ([isOpen, newText]) => {
      if (isOpen && newText) {
        await nextTick();
        computeBlocks();
      }
    },
    { immediate: true }
  );

  const resolveBlock = (id: number, decision: "accepted" | "rejected") => {
    const block = blocks.value.find((b) => b.id === id);
    if (block) block.status = decision;
  };

  const undoResolution = (id: number) => {
    const block = blocks.value.find((b) => b.id === id);
    if (block) block.status = "pending";
  };

  const handleFinalMerge = () => {
    let finalString = "";
    blocks.value.forEach((block) => {
      if (block.type === "equal") {
        finalString += block.newText;
      } else {
        finalString += block.status === "accepted" ? block.newText : block.oldText;
      }
    });
    emit("accept", finalString);
  };

  const pendingCount = computed(
    () => blocks.value.filter((b) => b.type === "change" && b.status === "pending").length
  );
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-300 ease-out"
      enter-from-class="opacity-0 translate-y-4"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-200 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 translate-y-4"
    >
      <div
        v-if="isOpen"
        class="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md"
      >
        <div
          class="w-full max-w-4xl bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl flex flex-col h-[90vh]"
        >
          <div
            class="px-6 py-4 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between shrink-0"
          >
            <div class="flex items-center gap-4">
              <div class="p-2 bg-fuchsia-500/10 rounded-lg border border-fuchsia-500/20">
                <GitCompare class="w-5 h-5 text-fuchsia-400" />
              </div>
              <div>
                <h3 class="text-lg font-bold text-zinc-100">Review de Alterações</h3>
                <p class="text-xs text-zinc-500">
                  {{ pendingCount > 0 ? `${pendingCount} blocos para revisar` : "Tudo revisado!" }}
                </p>
              </div>
            </div>
          </div>

          <div class="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8 bg-black/20">
            <div v-for="block in blocks" :key="block.id">
              <div
                v-if="block.type === 'equal'"
                class="pl-4 border-l-2 border-zinc-800 opacity-50 hover:opacity-100 transition-opacity"
              >
                <pre
                  class="font-mono text-sm text-zinc-500 whitespace-pre-wrap leading-relaxed font-normal"
                  >{{
                    block.oldText.length > 150 ? "... " + block.oldText.slice(-150) : block.oldText
                  }}</pre
                >
              </div>

              <div
                v-else
                class="relative group animate-in fade-in slide-in-from-bottom-2 duration-500"
              >
                <div
                  class="rounded-xl border overflow-hidden transition-all duration-300 shadow-lg"
                  :class="{
                    'border-zinc-700 bg-zinc-900': block.status === 'pending',
                    'border-green-500/20 bg-green-950/5 ring-1 ring-green-500/20':
                      block.status === 'accepted',
                    'border-red-500/20 bg-red-950/5 ring-1 ring-red-500/20':
                      block.status === 'rejected',
                  }"
                >
                  <div class="flex flex-col">
                    <div class="p-4 bg-red-950/10 border-b border-zinc-800/50 relative">
                      <div class="flex items-center justify-between mb-2">
                        <span
                          class="text-[10px] font-bold text-red-400 uppercase tracking-widest flex items-center gap-1"
                          >Original</span
                        >
                      </div>

                      <div
                        class="font-mono text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed"
                      >
                        <template v-for="(part, idx) in block.inlineDiffs || []" :key="idx">
                          <span v-if="part[0] === 0" class="opacity-60">{{
                            formatContext(part[1], 0, idx, block.inlineDiffs?.length || 0)
                          }}</span>

                          <span
                            v-else-if="part[0] === -1"
                            class="bg-red-500/20 text-red-200 line-through decoration-red-500/40 rounded-sm px-1 font-bold border border-red-500/20"
                            >{{ part[1] }}</span
                          >
                        </template>
                      </div>
                    </div>

                    <div class="h-0 flex items-center justify-center -my-3 z-10">
                      <div
                        class="bg-zinc-800 text-zinc-500 rounded-full p-1 border border-zinc-700 shadow-sm"
                      >
                        <ArrowDown :size="14" />
                      </div>
                    </div>

                    <div class="p-4 bg-green-950/10 relative pt-6">
                      <div class="flex items-center justify-between mb-2">
                        <span class="text-[10px] font-bold text-green-400 uppercase tracking-widest"
                          >Sugestão IA</span
                        >
                      </div>

                      <div
                        class="font-mono text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed"
                      >
                        <template v-for="(part, idx) in block.inlineDiffs || []" :key="idx">
                          <span v-if="part[0] === 0" class="opacity-60">{{
                            formatContext(part[1], 0, idx, block.inlineDiffs?.length || 0)
                          }}</span>

                          <span
                            v-else-if="part[0] === 1"
                            class="bg-green-500/20 text-green-200 border-b-2 border-green-500/40 rounded-sm px-1 font-bold"
                            >{{ part[1] }}</span
                          >
                        </template>
                      </div>
                    </div>
                  </div>

                  <div
                    class="flex items-center justify-between p-3 bg-zinc-950/50 border-t border-zinc-800/50"
                  >
                    <div class="pl-2">
                      <span
                        v-if="block.status === 'accepted'"
                        class="text-xs font-bold text-green-500 flex items-center gap-1"
                        ><Check :size="12" /> MUDANÇA ACEITA</span
                      >
                      <span
                        v-else-if="block.status === 'rejected'"
                        class="text-xs font-bold text-red-500 flex items-center gap-1"
                        ><X :size="12" /> MUDANÇA REJEITADA</span
                      >
                      <span v-else class="text-xs font-bold text-zinc-500"
                        >Aguardando decisão...</span
                      >
                    </div>

                    <div class="flex gap-2">
                      <button
                        v-if="block.status !== 'pending'"
                        @click="undoResolution(block.id)"
                        class="px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded transition-colors flex items-center gap-1"
                      >
                        <RotateCcw :size="12" /> Desfazer
                      </button>

                      <template v-else>
                        <button
                          @click="resolveBlock(block.id, 'rejected')"
                          class="px-3 py-1.5 text-xs font-medium text-red-300 hover:text-red-100 hover:bg-red-900/30 rounded transition-colors"
                        >
                          Manter Original
                        </button>
                        <button
                          @click="resolveBlock(block.id, 'accepted')"
                          class="px-4 py-1.5 text-xs font-bold text-white bg-green-600 hover:bg-green-500 shadow-lg shadow-green-900/20 rounded transition-all transform active:scale-95 flex items-center gap-2"
                        >
                          <Check :size="14" /> Aceitar
                        </button>
                      </template>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div v-if="blocks.length === 0" class="text-center py-10 text-zinc-500 italic">
              Nenhuma alteração detectada.
            </div>
          </div>

          <div
            class="px-6 py-4 bg-zinc-900 border-t border-zinc-800 flex justify-between items-center shrink-0"
          >
            <button @click="emit('close')" class="px-4 py-2 text-sm text-zinc-400 hover:text-white">
              Cancelar
            </button>
            <button
              @click="handleFinalMerge"
              :disabled="pendingCount > 0"
              class="px-6 py-2 text-sm font-bold text-zinc-950 bg-white hover:bg-zinc-200 rounded-lg shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {{ pendingCount > 0 ? `Restam ${pendingCount} decisões` : "Concluir Edição" }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
  .custom-scrollbar::-webkit-scrollbar {
    width: 6px;
  }
  .custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: #3f3f46;
    border-radius: 3px;
  }
</style>
