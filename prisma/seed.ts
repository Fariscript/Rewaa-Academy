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

type QuestionFixture = {
  type: "MCQ" | "TRUE_FALSE";
  prompt: string;
  options: { id: string; text: string }[];
  correctOption: string;
};

// Open item #7 (CLAUDE.md): 95% is only reachable at question counts that
// land on a whole number. These fixture quizzes deliberately have just 2
// questions each (0/50/100% possible, never 95%) because they're for test
// convenience, not real trainee-facing content — do NOT copy this count
// when authoring real quizzes.
const FIXTURE_QUESTIONS: Record<string, QuestionFixture[]> = {
  "استقبال العميل": [
    {
      type: "MCQ",
      prompt: "ما هي أول خطوة عند استقبال العميل؟",
      options: [
        { id: "a", text: "الترحيب والابتسام" },
        { id: "b", text: "سؤاله عن الدفع فوراً" },
        { id: "c", text: "تجاهله حتى يتحدث" },
      ],
      correctOption: "a",
    },
    {
      type: "TRUE_FALSE",
      prompt: "يجوز مقاطعة العميل أثناء حديثه لتسريع الخدمة.",
      options: [
        { id: "true", text: "صحيح" },
        { id: "false", text: "خطأ" },
      ],
      correctOption: "false",
    },
  ],
  "حساب التكلفة": [
    {
      type: "MCQ",
      prompt: "عند تسعير الخدمة، ماذا يجب توضيحه للعميل أولاً؟",
      options: [
        { id: "a", text: "السعر الإجمالي شاملاً الضريبة" },
        { id: "b", text: "لا داعي لذكر السعر" },
        { id: "c", text: "سعر تقديري دون أي تفاصيل" },
      ],
      correctOption: "a",
    },
    {
      type: "TRUE_FALSE",
      prompt: "يمكن تغيير السعر المتفق عليه دون إبلاغ العميل.",
      options: [
        { id: "true", text: "صحيح" },
        { id: "false", text: "خطأ" },
      ],
      correctOption: "false",
    },
  ],
  "الرد على اعتراض السعر": [
    {
      type: "MCQ",
      prompt: "عندما يعترض العميل على السعر، ما الأنسب؟",
      options: [
        { id: "a", text: "الاستماع لسبب الاعتراض ثم توضيح القيمة المقدمة" },
        { id: "b", text: "خفض السعر فوراً دون نقاش" },
        { id: "c", text: "إنهاء المكالمة" },
      ],
      correctOption: "a",
    },
    {
      type: "TRUE_FALSE",
      prompt: "الاعتراض على السعر يعني أن العميل غير مهتم نهائياً.",
      options: [
        { id: "true", text: "صحيح" },
        { id: "false", text: "خطأ" },
      ],
      correctOption: "false",
    },
  ],
  "الجرد الدوري": [
    {
      type: "MCQ",
      prompt: "ما الغرض الأساسي من الجرد الدوري؟",
      options: [
        { id: "a", text: "مطابقة المخزون الفعلي مع السجلات" },
        { id: "b", text: "زيادة الأسعار" },
        { id: "c", text: "تقليل عدد الموظفين" },
      ],
      correctOption: "a",
    },
    {
      type: "TRUE_FALSE",
      prompt: "يمكن تجاهل الفروقات الصغيرة في الجرد دون تسجيلها.",
      options: [
        { id: "true", text: "صحيح" },
        { id: "false", text: "خطأ" },
      ],
      correctOption: "false",
    },
  ],
  "افتتاح المحادثة": [
    {
      type: "MCQ",
      prompt: "أفضل طريقة لافتتاح المحادثة مع عميل جديد في المقهى؟",
      options: [
        { id: "a", text: "ترحيب ودود وسؤال عن رغبته" },
        { id: "b", text: "الانتظار حتى يبدأ العميل بالحديث" },
        { id: "c", text: "عرض العروض فوراً دون ترحيب" },
      ],
      correctOption: "a",
    },
    {
      type: "TRUE_FALSE",
      prompt: "نبرة الصوت لا تؤثر على انطباع العميل الأول.",
      options: [
        { id: "true", text: "صحيح" },
        { id: "false", text: "خطأ" },
      ],
      correctOption: "false",
    },
  ],
  "درجات حفظ الأطعمة": [
    {
      type: "MCQ",
      prompt: "ما أهمية الالتزام بدرجات حفظ الأطعمة؟",
      options: [
        { id: "a", text: "منع تلف الطعام وضمان سلامة العملاء" },
        { id: "b", text: "تسريع التحضير فقط" },
        { id: "c", text: "لا تأثير يذكر" },
      ],
      correctOption: "a",
    },
    {
      type: "TRUE_FALSE",
      prompt: "يمكن ترك الأطعمة القابلة للتلف خارج التبريد لفترات طويلة دون خطر.",
      options: [
        { id: "true", text: "صحيح" },
        { id: "false", text: "خطأ" },
      ],
      correctOption: "false",
    },
  ],
};

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
          let lesson = await prisma.lesson.findFirst({
            where: { unitId: unit.id, title: lessonTitle },
          });
          if (!lesson) {
            lesson = await prisma.lesson.create({ data: { title: lessonTitle, unitId: unit.id } });
          }

          // T-1: a pop quiz appears after each lesson.
          const quiz = await prisma.quiz.upsert({
            where: { lessonId: lesson.id },
            update: {},
            create: { lessonId: lesson.id, title: `اختبار: ${lessonTitle}` },
          });

          for (const questionFixture of FIXTURE_QUESTIONS[lessonTitle] ?? []) {
            const existingQuestion = await prisma.question.findFirst({
              where: { quizId: quiz.id, prompt: questionFixture.prompt },
            });
            if (!existingQuestion) {
              await prisma.question.create({
                data: {
                  quizId: quiz.id,
                  type: questionFixture.type,
                  prompt: questionFixture.prompt,
                  options: questionFixture.options,
                  correctOption: questionFixture.correctOption,
                },
              });
            }
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
