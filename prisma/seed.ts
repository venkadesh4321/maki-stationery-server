import bcrypt from 'bcryptjs';
import { PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const email = 'admin@stationery.local';
  const password = 'Admin@123';

  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      name: 'System Admin',
      email,
      passwordHash,
      role: Role.ADMIN,
      isActive: true,
    },
  });

  console.log('Seeded admin user:', email);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
