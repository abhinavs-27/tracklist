export function reactionTargetKey(target: {
  targetType: string;
  targetId: string;
}): string {
  return `${target.targetType}\u001f${target.targetId}`;
}
