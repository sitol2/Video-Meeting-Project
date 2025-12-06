const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');

const db = new sqlite3.Database('./users.db', (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
        process.exit(1);
    }
});

async function createInitialAdmin() {
    const name = 'Admin';
    const email = 'admin@lspu-stacruz.edu';
    const password = 'lspu-stacruz';

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        db.run(
            `INSERT INTO users (student_id, name, course, email, password, role) VALUES (NULL, ?, NULL, ?, ?, 'admin')`,
            [name, email, hashedPassword],
            function (err) {
                if (err) {
                    if (err.message.includes('UNIQUE constraint failed')) {
                        console.log('Admin account already exists');
                    } else {
                        console.error('Error creating admin:', err.message);
                    }
                } else {
                    console.log('\n✅ Initial admin account created successfully!');
                    console.log(`   Name: ${name}`);
                    console.log(`   Email: ${email}`);
                    console.log(`   Password: ${password}`);
                    console.log(`   User ID: ${this.lastID}`);
                    console.log('\n⚠️  IMPORTANT: Change this password after first login!');
                }

                db.close();
            }
        );
    } catch (error) {
        console.error('Error:', error);
        db.close();
    }
}

createInitialAdmin();
