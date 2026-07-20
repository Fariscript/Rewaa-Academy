import { prisma } from "../src/lib/prisma";

// One fixture user per role (CLAUDE.md Roles table) for local dev + tests.
const FIXTURE_USERS = [
  { email: "trainee@example.com", name: "Trainee Fixture", role: "TRAINEE" as const },
  { email: "trainer@example.com", name: "Trainer Fixture", role: "TRAINER_TRAINING_MANAGER" as const },
  { email: "admin@example.com", name: "Admin Fixture", role: "ADMIN" as const },
];

// Stub taxonomy fixture — NOT the authoritative sector/sub-sector list (that
// belongs to Ibrahim's content system, FR-05/FR-06). Just enough shape to
// exercise sector-scoped access and unit tagging (T-14) in tests.
const FIXTURE_TAXONOMY = [
  {
    sector: "الخدمات",
    subSectors: [
      {
        name: "الصيانة المنزلية",
        units: [
          { name: "أول مكالمة", skillType: "SOFT" as const, lessons: ["استقبال العميل"] },
          { name: "تسعير الخدمة", skillType: "HARD" as const, lessons: ["حساب التكلفة"] },
        ],
      },
    ],
  },
  {
    sector: "التجزئة",
    subSectors: [
      {
        name: "الأزياء",
        units: [
          { name: "التعامل مع الاعتراضات", skillType: "SOFT" as const, lessons: ["الرد على اعتراض السعر"] },
          { name: "إدارة المخزون", skillType: "HARD" as const, lessons: ["الجرد الدوري"] },
        ],
      },
    ],
  },
  {
    sector: "المطاعم والمقاهي",
    subSectors: [
      {
        name: "المقاهي",
        units: [
          { name: "الترحيب بالعميل", skillType: "SOFT" as const, lessons: ["افتتاح المحادثة"] },
          { name: "معايير السلامة الغذائية", skillType: "HARD" as const, lessons: ["درجات حفظ الأطعمة"] },
        ],
      },
    ],
  },
];

async function seedUsers() {
  for (const user of FIXTURE_USERS) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: { name: user.name, role: user.role },
      create: user,
    });
  }
}

async function seedTaxonomy() {
  for (const sectorFixture of FIXTURE_TAXONOMY) {
    const sector = await prisma.sector.upsert({
      where: { name: sectorFixture.sector },
      update: {},
      create: { name: sectorFixture.sector },
    });

    for (const subSectorFixture of sectorFixture.subSectors) {
      const subSector = await prisma.subSector.upsert({
        where: { sectorId_name: { sectorId: sector.id, name: subSectorFixture.name } },
        update: {},
        create: { name: subSectorFixture.name, sectorId: sector.id },
      });

      for (const unitFixture of subSectorFixture.units) {
        const unit = await prisma.unit.upsert({
          where: { subSectorId_name: { subSectorId: subSector.id, name: unitFixture.name } },
          update: {},
          create: {
            name: unitFixture.name,
            skillType: unitFixture.skillType,
            subSectorId: subSector.id,
          },
        });

        for (const lessonTitle of unitFixture.lessons) {
          const existing = await prisma.lesson.findFirst({
            where: { unitId: unit.id, title: lessonTitle },
          });
          if (!existing) {
            await prisma.lesson.create({ data: { title: lessonTitle, unitId: unit.id } });
          }
        }
      }
    }
  }

  // Default fixture trainee starts assigned to the first sector (الخدمات).
  const firstSector = await prisma.sector.findUniqueOrThrow({ where: { name: "الخدمات" } });
  await prisma.user.update({
    where: { email: "trainee@example.com" },
    data: { sectorId: firstSector.id },
  });
}

async function main() {
  await seedUsers();
  await seedTaxonomy();
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
