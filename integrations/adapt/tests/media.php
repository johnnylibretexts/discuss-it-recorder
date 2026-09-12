<?php
require '/var/www/tmp/vendor/autoload.php';
$app = require '/var/www/tmp/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$finished = false;
register_shutdown_function(function () use (&$finished) { if (!$finished) exit(1); });
$directory = sys_get_temp_dir().'/discuss-it-media-test-'.bin2hex(random_bytes(6));
mkdir($directory, 0700);
config(['database.default' => 'sqlite', 'database.connections.sqlite' => ['driver' => 'sqlite', 'database' => ':memory:', 'prefix' => ''], 'filesystems.disks.s3' => ['driver' => 'local', 'root' => $directory]]);
require '/var/www/tmp/database/migrations/2026_09_09_000001_create_discuss_it_tables.php';
(new CreateDiscussItTables())->up();
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\Process\Process;
function runMedia(array $args) { $p = new Process($args); $p->setTimeout(30); $p->mustRun(); return $p->getOutput(); }
foreach (['video', 'audio', 'invalid'] as $kind) {
    $id = (string) Illuminate\Support\Str::uuid();
    $key = $id.'/input';
    Storage::disk('s3')->makeDirectory($id);
    $file = $directory.'/'.$key;
    if ($kind === 'invalid') file_put_contents($file, "#EXTM3U\nfile:///etc/passwd\n");
    else {
        $args = ['ffmpeg', '-nostdin', '-v', 'error', '-y'];
        if ($kind === 'video') $args = array_merge($args, ['-f', 'lavfi', '-i', 'color=c=purple:s=320x240:r=15']);
        $args = array_merge($args, ['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '1.5', '-threads', '1', '-c:a', 'aac']);
        if ($kind === 'video') $args = array_merge($args, ['-c:v', 'libx264', '-pix_fmt', 'yuv420p']);
        runMedia(array_merge($args, ['-f', 'mp4', $file]));
    }
    DB::table('discuss_it_media')->insert(['id' => $id, 'assignment_id' => 1, 'question_id' => 1, 'user_id' => 1, 'object_key' => $key, 'kind' => $kind === 'audio' ? 'audio' : 'video', 'status' => 'processing', 'created_at' => now(), 'updated_at' => now()]);
    (new App\Services\DiscussItMediaProcessor())->process(DB::table('discuss_it_media')->where('id', $id)->first());
    $result = DB::table('discuss_it_media')->where('id', $id)->first();
    if ($kind === 'invalid') {
        if ($result->status !== 'failed') throw new RuntimeException('Playlist input was not rejected');
    } else {
        if ($result->status !== 'ready' || $result->duration_ms < 1400 || !Storage::disk('s3')->exists($result->output_key)) throw new RuntimeException($kind.' processing failed');
        if (Storage::disk('s3')->exists($key)) throw new RuntimeException('Temporary upload retained after success');
    }
    echo 'PASS media '.$kind.' '.$result->status."\n";
}
$finished = true;
