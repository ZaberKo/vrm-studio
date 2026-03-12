import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get target directory from arguments, default to 'public/pose'
const targetDirArg = process.argv[2] || 'public/pose';
const dir = path.resolve(__dirname, targetDirArg);

console.log(`Scanning for VRM 0.0 pose JSON files in: ${dir}`);

if (!fs.existsSync(dir)) {
    console.error(`Error: Directory not found: ${dir}`);
    process.exit(1);
}

const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
let fixedCount = 0;

files.forEach(file => {
    const filepath = path.join(dir, file);
    try {
        const content = JSON.parse(fs.readFileSync(filepath, 'utf8'));
        
        // Convert 0.0 standard to 1.0 (VRM 1.0 faces +Z instead of -Z)
        // Local rotations need flipping on X and Z for the 180 Y-axis flip.
        if (content.vrmVersion !== "1.0" && content.vrmVersion === "0") {
            console.log(`Fixing: ${file}`);
            if (content.data) {
                for (const bone in content.data) {
                    const rot = content.data[bone].rotation;
                    if (rot && rot.length === 4) {
                        content.data[bone].rotation = [
                            -rot[0], // negate x
                            rot[1],  // keep y
                            -rot[2], // negate z
                            rot[3]   // keep w
                        ];
                    }
                }
            }
            content.vrmVersion = "1.0"; // Upgrade
            fs.writeFileSync(filepath, JSON.stringify(content));
            fixedCount++;
        } else if (content.vrmVersion === "1.0") {
            console.log(`Skipping (already 1.0): ${file}`);
        }
    } catch (err) {
         console.error(`Error processing file ${file}:`, err.message);
    }
});

console.log(`\nAll poses processed. Successfully fixed ${fixedCount} files.`);
