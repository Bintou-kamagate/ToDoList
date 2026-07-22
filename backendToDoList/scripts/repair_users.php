<?php

require __DIR__ . '/../vendor/autoload.php';
$app = require_once __DIR__ . '/../bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use Illuminate\Support\Facades\DB;

$action = $argv[1] ?? 'list';

if ($action === 'list') {
    $rows = DB::select("SELECT email, COUNT(*) AS c FROM users GROUP BY email HAVING COUNT(*) > 1");
    if (empty($rows)) {
        echo "No duplicates found\n";
        exit(0);
    }
    foreach ($rows as $r) {
        echo ($r->email ?? '(null)') . ' => ' . $r->c . PHP_EOL;
    }
    exit(0);
}

if ($action === 'backup') {
    DB::statement("CREATE TABLE IF NOT EXISTS users_backup AS TABLE users");
    echo "users_backup created\n";
    exit(0);
}

if ($action === 'cleanup') {
    DB::statement(<<<'SQL'
WITH duplicates AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY email ORDER BY id DESC) AS rn
  FROM users
)
DELETE FROM users
USING duplicates
WHERE users.id = duplicates.id
  AND duplicates.rn > 1;
SQL
    );
}
if ($action === 'inspect') {
    $tbl = DB::select("SELECT to_regclass('public.users') AS reg");
    $exists = ($tbl && isset($tbl[0]->reg) && $tbl[0]->reg) ? $tbl[0]->reg : null;
    echo "users table: " . ($exists ?? 'NOT FOUND') . PHP_EOL;

    $constraints = DB::select("SELECT conname, pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c JOIN pg_class t ON c.conrelid = t.oid WHERE t.relname = 'users'");
    if (empty($constraints)) {
        echo "No constraints found for users\n";
    } else {
        foreach ($constraints as $c) {
            echo "constraint: " . $c->conname . " => " . $c->definition . PHP_EOL;
        }
    }
    exit(0);
}

echo "Unknown action: $action\n";
exit(1);
