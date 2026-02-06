import 'dotenv/config';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// Country codes data
import { codeOfCountries } from '../scripts/country-codes.data';

// Channel definitions data
import { CHANNEL_DEFINITIONS } from '../scripts/channel-definitions.data';

// Plugin definitions data
import { PLUGIN_DEFINITIONS } from '../scripts/plugin-definitions.data';

// Persona templates data
import { SYSTEM_TEMPLATES } from '../scripts/persona-templates.data';

// ============================================================================
// Seed Functions
// ============================================================================

async function seedPersonaTemplates() {
  console.log('🎭 Seeding persona templates...');

  for (const template of SYSTEM_TEMPLATES) {
    // Check for existing template by name AND locale
    const existing = await prisma.personaTemplate.findFirst({
      where: {
        name: template.name,
        locale: template.locale,
        isSystem: true,
        isDeleted: false,
      },
    });

    if (existing) {
      console.log(`  ⏭️  Skipping existing: ${template.name} (${template.locale})`);
      continue;
    }

    await prisma.personaTemplate.create({
      data: {
        ...template,
        isSystem: true,
        createdById: null,
      },
    });
    console.log(`  ✅ Created: ${template.name} (${template.locale})`);
  }

  const totalCount = await prisma.personaTemplate.count({
    where: { isSystem: true, isDeleted: false },
  });
  const enCount = await prisma.personaTemplate.count({
    where: { isSystem: true, isDeleted: false, locale: 'en' },
  });
  const zhCount = await prisma.personaTemplate.count({
    where: { isSystem: true, isDeleted: false, locale: 'zh-CN' },
  });
  console.log(
    `🎭 Persona templates seeding completed! (${totalCount} total: ${enCount} en, ${zhCount} zh-CN)`,
  );
}

async function seedCountryCodes() {
  console.log('\n🌍 Seeding country codes...');

  console.log('  🧹 Clearing existing country codes...');
  const deleteResult = await prisma.countryCode.deleteMany({});
  console.log(`  🗑️  Deleted ${deleteResult.count} existing records`);

  const data: { continent: string; code: string }[] = [];

  for (const [continent, codes] of Object.entries(codeOfCountries)) {
    for (const code of codes) {
      data.push({ continent, code });
    }
  }

  console.log(`  📦 Preparing to insert ${data.length} records...`);

  if (data.length > 0) {
    const result = await prisma.countryCode.createMany({
      data,
      skipDuplicates: true,
    });
    console.log(`  ✅ Inserted ${result.count} country code records!`);
  } else {
    console.log('  ℹ️  No country code data to insert');
  }

  const count = await prisma.countryCode.count();
  console.log(`🌍 Country codes seeding completed! (${count} records)`);
}

async function seedChannelDefinitions() {
  console.log('\n📡 Seeding channel definitions...');

  // Get the list of supported channel IDs
  const supportedChannelIds = CHANNEL_DEFINITIONS.map((c) => c.id);

  // Soft delete channels that are not in the supported list
  const unsupportedChannels = await prisma.channelDefinition.findMany({
    where: {
      id: { notIn: supportedChannelIds },
      isDeleted: false,
    },
  });

  if (unsupportedChannels.length > 0) {
    console.log('  🧹 Removing unsupported channels...');
    for (const channel of unsupportedChannels) {
      // Soft delete the channel
      await prisma.channelDefinition.update({
        where: { id: channel.id },
        data: { isDeleted: true },
      });
      // Soft delete associated credential fields
      await prisma.channelCredentialField.updateMany({
        where: { channelId: channel.id },
        data: { isDeleted: true },
      });
      console.log(`  🗑️  Removed: ${channel.label}`);
    }
  }

  for (const channelData of CHANNEL_DEFINITIONS) {
    const { credentials, ...channelInfo } = channelData;

    // Check if channel already exists
    const existing = await prisma.channelDefinition.findUnique({
      where: { id: channelInfo.id },
    });

    if (existing) {
      // Update existing channel
      await prisma.channelDefinition.update({
        where: { id: channelInfo.id },
        data: {
          ...channelInfo,
          isDeleted: false,
        },
      });
      console.log(`  ⏭️  Updated existing: ${channelInfo.label}`);
    } else {
      // Create new channel
      await prisma.channelDefinition.create({
        data: channelInfo,
      });
      console.log(`  ✅ Created: ${channelInfo.label}`);
    }

    // Soft delete credential fields that are not in the current definition
    const currentFieldKeys = credentials.map((f) => f.key);
    await prisma.channelCredentialField.updateMany({
      where: {
        channelId: channelInfo.id,
        key: { notIn: currentFieldKeys },
        isDeleted: false,
      },
      data: { isDeleted: true },
    });

    // Upsert credential fields
    for (const field of credentials) {
      const existingField = await prisma.channelCredentialField.findFirst({
        where: {
          channelId: channelInfo.id,
          key: field.key,
        },
      });

      if (existingField) {
        await prisma.channelCredentialField.update({
          where: { id: existingField.id },
          data: {
            ...field,
            channelId: channelInfo.id,
            isDeleted: false,
          },
        });
      } else {
        await prisma.channelCredentialField.create({
          data: {
            ...field,
            channelId: channelInfo.id,
          },
        });
      }
    }
  }

  const channelCount = await prisma.channelDefinition.count({
    where: { isDeleted: false },
  });
  const fieldCount = await prisma.channelCredentialField.count({
    where: { isDeleted: false },
  });
  console.log(
    `📡 Channel definitions seeding completed! (${channelCount} channels, ${fieldCount} credential fields)`,
  );
}

async function seedPlugins() {
  console.log('\n🔌 Seeding plugins...');

  for (const pluginData of PLUGIN_DEFINITIONS) {
    const existing = await prisma.plugin.findUnique({
      where: { slug: pluginData.slug },
    });

    if (existing) {
      // Update existing plugin
      await prisma.plugin.update({
        where: { slug: pluginData.slug },
        data: {
          name: pluginData.name,
          description: pluginData.description,
          version: pluginData.version,
          author: pluginData.author,
          category: pluginData.category,
          region: pluginData.region,
          configSchema: pluginData.configSchema as Prisma.InputJsonValue,
          defaultConfig: pluginData.defaultConfig as Prisma.InputJsonValue,
          mcpConfig: pluginData.mcpConfig,
          isOfficial: pluginData.isOfficial,
          iconEmoji: pluginData.iconEmoji,
          downloadUrl: pluginData.downloadUrl,
          isDeleted: false,
        },
      });
      console.log(
        `  ⏭️  Updated existing: ${pluginData.name} (${pluginData.region})`,
      );
    } else {
      // Create new plugin
      await prisma.plugin.create({
        data: {
          name: pluginData.name,
          slug: pluginData.slug,
          description: pluginData.description,
          version: pluginData.version,
          author: pluginData.author,
          category: pluginData.category,
          region: pluginData.region,
          configSchema: pluginData.configSchema as Prisma.InputJsonValue,
          defaultConfig: pluginData.defaultConfig as Prisma.InputJsonValue,
          mcpConfig: pluginData.mcpConfig,
          isOfficial: pluginData.isOfficial,
          iconEmoji: pluginData.iconEmoji,
          downloadUrl: pluginData.downloadUrl,
        },
      });
      console.log(`  ✅ Created: ${pluginData.name} (${pluginData.region})`);
    }
  }

  const count = await prisma.plugin.count({
    where: { isDeleted: false },
  });
  const cnCount = await prisma.plugin.count({
    where: { isDeleted: false, region: 'cn' },
  });
  const enCount = await prisma.plugin.count({
    where: { isDeleted: false, region: 'en' },
  });
  const globalCount = await prisma.plugin.count({
    where: { isDeleted: false, region: 'global' },
  });
  console.log(
    `🔌 Plugins seeding completed! (${count} total: ${globalCount} global, ${cnCount} cn, ${enCount} en)`,
  );
}

async function main() {
  console.log('🌱 Starting database seeding...\n');

  await seedPersonaTemplates();
  await seedCountryCodes();
  await seedChannelDefinitions();
  await seedPlugins();

  console.log('\n✅ Database seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
