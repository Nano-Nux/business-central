import fs from 'fs';

const content = fs.readFileSync('lib/guide-data.ts', 'utf8');

// Match each section block
const sectionRegex = /id:\s*"([^"]+)",\s*route:\s*"([^"]+)",[\s\S]*?screenshot:\s*"([^"]+)",[\s\S]*?title:\s*\{[\s\S]*?en:\s*"([^"]+)",[\s\S]*?steps:\s*\[([\s\S]*?)\]\s*,\s*proTip/g;

let match;
const sections = [];
while ((match = sectionRegex.exec(content)) !== null) {
  const [_, id, route, screenshot, title, stepsRaw] = match;
  const stepRegex = /number:\s*(\d+),\s*label:\s*\{[\s\S]*?en:\s*"([^"]+)"/g;
  const steps = [];
  let sMatch;
  while ((sMatch = stepRegex.exec(stepsRaw)) !== null) {
    steps.push({ number: parseInt(sMatch[1]), label: sMatch[2] });
  }
  sections.push({ id, route, screenshot, title, steps });
}

console.log(JSON.stringify(sections, null, 2));
