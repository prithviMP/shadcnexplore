import { db } from "./server/db";
import { users } from "./shared/schema";
import { eq } from "drizzle-orm";

async function enableUser() {
  const email = process.argv[2] || 'admin@finanalytics.com';
  
  console.log(`🔄 Enabling user: ${email}`);
  
  const result = await db.update(users)
    .set({ enabled: true })
    .where(eq(users.email, email))
    .returning();
  
  if (result.length > 0) {
    console.log('✅ User enabled successfully!');
    console.log('   Email:', result[0].email);
    console.log('   Role:', result[0].role);
  } else {
    console.log('❌ User not found:', email);
  }
  
  process.exit(0);
}

enableUser();

