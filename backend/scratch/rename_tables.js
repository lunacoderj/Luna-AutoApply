import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..', 'src');

const tables = [
  'profiles',
  'preferences',
  'education_details',
  'api_keys',
  'internships',
  'applications',
  'email_logs'
];

function walk(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      walk(fullPath);
    } else if (file.endsWith('.js')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      let changed = false;
      
      tables.forEach(table => {
        // 1. .from('table')
        const fromRegex = new RegExp(`\\.from\\(['"]${table}['"]\\)`, 'g');
        if (fromRegex.test(content)) {
          content = content.replace(fromRegex, `.from('luna_${table}')`);
          changed = true;
        }

        // 2. Select joins: "..., internships ( ... )"
        // We look for the table name followed by optional space and (
        const joinRegex = new RegExp(`(?<=[\\s,\\\`'])${table}(?=\\s*\\()`, 'g');
        if (joinRegex.test(content)) {
          content = content.replace(joinRegex, `luna_${table}`);
          changed = true;
        }
      });
      
      if (changed) {
        console.log(`Updated: ${fullPath}`);
        fs.writeFileSync(fullPath, content);
      }
    }
  }
}

walk(root);
console.log('Done!');
