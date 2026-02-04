const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const generatedClient = path.join(rootDir, 'generated', 'prisma-client');

// Find the pnpm store location for @prisma/client
const rootNodeModules = path.resolve(rootDir, '../../node_modules');
const pnpmDir = path.join(rootNodeModules, '.pnpm');

function findPrismaClientDir(dir) {
    if (!fs.existsSync(dir)) return null;
    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
        if (entry.startsWith('@prisma+client@')) {
            const clientPath = path.join(dir, entry, 'node_modules');
            if (fs.existsSync(clientPath)) {
                return clientPath;
            }
        }
    }
    return null;
}

try {
    // Check if generated client exists
    if (!fs.existsSync(generatedClient)) {
        console.log('Generated Prisma client not found at:', generatedClient);
        console.log('Run "prisma generate" first.');
        process.exit(0);
    }

    const prismaClientNodeModules = findPrismaClientDir(pnpmDir);

    if (!prismaClientNodeModules) {
        console.log('Could not find @prisma/client in pnpm store');
        process.exit(0);
    }

    const targetLink = path.join(prismaClientNodeModules, '.prisma', 'client');
    const targetDir = path.dirname(targetLink);

    // Ensure .prisma directory exists
    if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
    }

    // Remove existing symlink/directory if present
    if (fs.existsSync(targetLink)) {
        fs.rmSync(targetLink, { recursive: true, force: true });
    }

    // Create symlink
    fs.symlinkSync(generatedClient, targetLink, 'junction');
    console.log(`Created symlink: ${targetLink} -> ${generatedClient}`);
} catch (error) {
    console.error('Error creating .prisma symlink:', error.message);
    // Don't fail the install
    process.exit(0);
}
