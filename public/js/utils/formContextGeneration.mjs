export function createFormContextGeneration() {
  let generation = 0;

  return {
    invalidate() {
      generation += 1;
      return generation;
    },
    capture(editingId = null) {
      return Object.freeze({ generation, editingId });
    },
    isCurrent(context, editingId = null) {
      return Boolean(context)
        && context.generation === generation
        && context.editingId === editingId;
    }
  };
}