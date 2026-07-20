import { prisma } from "../src/lib/prisma";

// One fixture user per role (CLAUDE.md Roles table) for local dev + tests.
const FIXTURE_USERS = [
  { email: "trainee@example.com", name: "Trainee Fixture", role: "TRAINEE" as const },
  { email: "trainer@example.com", name: "Trainer Fixture", role: "TRAINER_TRAINING_MANAGER" as const },
  { email: "admin@example.com", name: "Admin Fixture", role: "ADMIN" as const },
];

async function main() {
  for (const user of FIXTURE_USERS) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: { name: user.name, role: user.role },
      create: user,
    });
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
