// The repository uses capitalised types with a scope, e.g. "Feat(Init): ...".
const types = [
  'Feat',
  'Fix',
  'Docs',
  'Style',
  'Refactor',
  'Perf',
  'Test',
  'Build',
  'CI',
  'Chore',
  'Revert',
];

export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [2, 'always', types],
    'type-case': [0],
    'subject-case': [0],
    'scope-case': [0],
  },
};
