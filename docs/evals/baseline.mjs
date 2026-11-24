import { readFile } from 'node:fs/promises';
import { rulebookSuggestions } from '../../aithya-studio/src/rulebook-import.js';

const examples = JSON.parse(await readFile(new URL('rules.json', import.meta.url), 'utf8'));
let recognizedFields = 0;
let spuriousDeadlines = 0;
for (const example of examples) {
  const predictions = rulebookSuggestions(example.input, {});
  const fields = predictions.map(item => item.group + '.' + item.key);
  if (fields.includes(example.expectedField)) recognizedFields++;
  if (example.expectedField !== 'project.submission_deadline' && fields.includes('project.submission_deadline')) spuriousDeadlines++;
  console.log(example.name, fields.join(', ') || 'abstained');
}
console.log('Expected field identified:', recognizedFields, '/', examples.length);
console.log('Spurious deadlines outside the deadline case:', spuriousDeadlines);
