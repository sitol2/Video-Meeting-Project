const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const db = new sqlite3.Database('./users.db', (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
        process.exit(1);
    }
    console.log('Connected to the database.');
});

function question(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

async function createAdminAccount() {
    console.log('\n=== Create Admin Account ===\n');

    const name = await question('Enter admin name: ');
    const email = await question('Enter admin email: ');
    const password = await question('Enter admin password: ');

    if (!name || !email || !password) {
        console.error('Error: All fields are required');
        rl.close();
        db.close();
        return;
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        db.run(
            `INSERT INTO users (student_id, name, course, email, password, role) VALUES (NULL, ?, NULL, ?, ?, 'admin')`,
            [name, email, hashedPassword],
            function (err) {
                if (err) {
                    if (err.message.includes('UNIQUE constraint failed: users.email')) {
                        console.error('Error: Email already exists');
                    } else {
                        console.error('Error creating admin:', err.message);
                    }
                } else {
                    console.log(`\n✅ Admin account created successfully!`);
                    console.log(`   Name: ${name}`);
                    console.log(`   Email: ${email}`);
                    console.log(`   User ID: ${this.lastID}`);
                }

                rl.close();
                db.close();
            }
        );
    } catch (error) {
        console.error('Error hashing password:', error);
        rl.close();
        db.close();
    }
}

createAdminAccount();
