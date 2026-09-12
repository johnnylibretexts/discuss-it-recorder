<?php
// Standalone integration checks in an ephemeral SQLite database, never live MySQL.
require '/var/www/tmp/vendor/autoload.php';
$app = require '/var/www/tmp/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
config(['database.default' => 'sqlite', 'database.connections.sqlite' => ['driver' => 'sqlite', 'database' => ':memory:', 'prefix' => ''], 'cache.default' => 'array', 'session.driver' => 'array']);
$finished = false;
register_shutdown_function(function () use (&$finished) { if (!$finished) { fwrite(STDERR, "Checks did not complete.\n"); exit(1); } });
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Auth;
use Illuminate\Http\Request;
use App\Services\DiscussIt;
use App\Http\Controllers\DiscussItController;

foreach ([
    'users' => ['first_name', 'last_name', 'role'],
    'assignments' => ['course_id', 'late_policy'],
    'assignment_question' => ['assignment_id', 'question_id', 'points'],
    'enrollments' => ['course_id', 'section_id', 'user_id'],
    'submission_files' => ['assignment_id', 'question_id', 'user_id', 'type', 'original_filename', 'submission', 'date_submitted', 'date_graded', 'score'],
    'submissions' => ['assignment_id', 'question_id', 'user_id', 'score'],
    'extensions' => ['assignment_id', 'user_id', 'extension'],
    'lti_launches' => ['assignment_id', 'user_id'],
    'can_give_ups' => ['assignment_id', 'question_id', 'user_id', 'status'],
    'scores' => ['assignment_id', 'user_id', 'score'],
    'sections' => ['course_id'],
] as $table => $columns) {
    Schema::create($table, function ($table) use ($columns) { $table->id(); foreach ($columns as $column) $table->text($column)->nullable(); $table->timestamps(); });
}
require '/var/www/tmp/database/migrations/2026_09_09_000001_create_discuss_it_tables.php';
(new CreateDiscussItTables())->up();
$passed = 0;
function check($condition, $message) { global $passed; if (!$condition) throw new RuntimeException($message); $passed++; echo "PASS $message\n"; }
function denied($callback, $code, $message) {
    try { $callback(); } catch (Symfony\Component\HttpKernel\Exception\HttpException $error) { check($error->getStatusCode() === $code, $message); return; }
    catch (Illuminate\Auth\Access\AuthorizationException $error) { check($code === 403, $message); return; }
    throw new RuntimeException('Expected rejection: '.$message);
}
$user = new App\User(['id' => 1, 'role' => 2]); $user->id = 1;
function asUser($id, $role, $data = []) {
    $user = new App\User(); $user->id = $id; $user->role = $role;
    Auth::guard()->setUser($user);
    $request = Request::create('/api/discuss-it/1/10', 'POST', $data);
    $request->setUserResolver(function () use ($user) { return $user; });
    app()->instance('request', $request);
    return $request;
}
$course = new App\Course(); $course->id = 1; $course->user_id = 1; $course->anonymous_users = 0; $course->formative = 0;
$course->setRelation('enrollments', new Illuminate\Database\Eloquent\Collection([(object) ['user_id' => 2], (object) ['user_id' => 3]]));
$assignment = new class extends App\Assignment {
    public $timing;
    public function assignToTimingByUser($key = '') { return $key ? $this->timing->$key : $this->timing; }
};
$assignment->id = 1; $assignment->course_id = 1; $assignment->shown = 1; $assignment->formative = 0;
$assignment->assessment_type = 'real time'; $assignment->number_of_allowed_attempts = 'unlimited'; $assignment->scoring_type = 'p'; $assignment->late_policy = 'not accepted';
$assignment->timing = (object) ['available_from' => '2020-01-01', 'due' => '2099-01-01'];
$assignment->setRelation('course', $course);
$question = new App\Question(); $question->id = 10; $question->technology = 'qti'; $question->qti_json = '{"questionType":"discuss_it","prompt":"Test"}';
$assignment->setRelation('questions', new Illuminate\Database\Eloquent\Collection([$question]));
DB::table('assignments')->insert(['id' => 1, 'course_id' => 1]);
DB::table('assignment_question')->insert(['assignment_id' => 1, 'question_id' => 10, 'points' => 2]);
DB::table('enrollments')->insert([['course_id' => 1, 'section_id' => 5, 'user_id' => 2], ['course_id' => 1, 'section_id' => 6, 'user_id' => 3]]);
foreach ([1, 2, 3, 4] as $id) DB::table('users')->insert(['id' => $id, 'first_name' => 'Test', 'last_name' => (string) $id]);
$service = new DiscussIt(); $controller = new DiscussItController();
$settings = array_merge(DiscussIt::defaults(), ['enabled' => true, 'min_words' => 2, 'min_seconds' => 3, 'group_by_section' => true]);
asUser(1, 2);
$controller->settings(asUser(1, 2, $settings), $assignment, $question, $service);
check($service->scope($assignment, $question)['owner'], 'instructor owns discussion');
asUser(4, 3); denied(function () use ($service, $assignment, $question) { $service->scope($assignment, $question); }, 403, 'unenrolled user denied');
asUser(2, 3); check($service->scope($assignment, $question)['group'] === 'section:5', 'student scoped to enrolled section');
$assignment->timing->available_from = '2099-01-01';
denied(function () use ($service, $assignment, $question) { $service->scope($assignment, $question); }, 403, 'future availability denied');
$assignment->timing->available_from = '2020-01-01';
$assignment->timing->due = '2020-01-01';
denied(function () use ($service, $assignment, $question) { $service->scope($assignment, $question, true); }, 403, 'late submission denied through existing policy');
$assignment->timing->due = '2099-01-01';
$payload = ['request_id' => '10000000-0000-4000-8000-000000000001', 'text' => 'Hello everyone'];
$first = $controller->store(asUser(2, 3, $payload), $assignment, $question, $service)->getData()->id;
$again = $controller->store(asUser(2, 3, $payload), $assignment, $question, $service)->getData()->id;
check((int) $first === (int) $again && DB::table('discuss_it_comments')->count() === 1, 'post retry is idempotent');
asUser(3, 3); check($service->comments($assignment, $question, $service->scope($assignment, $question))->count() === 0, 'cross-section content hidden');
denied(function () use ($controller, $assignment, $question, $service, $first) { $controller->store(asUser(3, 3, ['request_id' => '10000000-0000-4000-8000-000000000002', 'parent_id' => $first, 'text' => 'Unauthorized reply']), $assignment, $question, $service); }, 422, 'cross-section reply denied');
denied(function () use ($controller, $assignment, $question, $service, $first) { $controller->update(asUser(3, 3, ['text' => 'Unauthorized edit']), $assignment, $question, $first, $service); }, 404, 'cross-section edit denied');
denied(function () use ($controller, $assignment, $question, $service, $settings) { $controller->settings(asUser(1, 2, array_merge($settings, ['group_by_section' => false])), $assignment, $question, $service); }, 422, 'group rules frozen after posting');
check(!$service->satisfied('', (object) ['duration_ms' => 2999], $settings), 'server duration rejects short media');
check($service->satisfied('', (object) ['duration_ms' => 3000], $settings), 'server duration accepts required length');
check(!$service->satisfied('one', null, $settings), 'text word minimum enforced');
Illuminate\Support\Facades\Storage::fake('s3');
$mediaId = '20000000-0000-4000-8000-000000000001';
DB::table('discuss_it_media')->insert(['id' => $mediaId, 'assignment_id' => 1, 'question_id' => 10, 'user_id' => 2, 'object_key' => 'test/input', 'kind' => 'video', 'status' => 'uploading', 'created_at' => now(), 'updated_at' => now()]);
asUser(3, 3);
denied(function () use ($controller, $assignment, $question, $service, $mediaId) { $controller->finalize($assignment, $question, $mediaId, $service); }, 404, 'another user cannot finalize an upload');
asUser(2, 3);
$put = Request::create('/test', 'PUT', [], [], [], ['CONTENT_TYPE' => 'video/mp4'], 'test-media-bytes');
$put->setUserResolver(function () { return auth()->user(); });
app()->instance('request', $put);
$controller->content($put, $assignment, $question, $mediaId, $service);
check(Illuminate\Support\Facades\Storage::disk('s3')->get('test/input') === 'test-media-bytes', 'authenticated PUT streams bytes to private storage');
$controller->finalize($assignment, $question, $mediaId, $service);
check(DB::table('discuss_it_media')->where('id', $mediaId)->value('status') === 'pending', 'finalize queues verification, not an immediate post');
denied(function () use ($controller, $put, $assignment, $question, $service, $mediaId) { $controller->content($put, $assignment, $question, $mediaId, $service); }, 409, 'processing upload cannot be overwritten');
denied(function () use ($controller, $assignment, $question, $service, $mediaId) { $controller->store(asUser(2, 3, ['request_id' => '30000000-0000-4000-8000-000000000001', 'media_id' => $mediaId]), $assignment, $question, $service); }, 422, 'unverified media cannot be posted');
$controller->update(asUser(2, 3, ['text' => 'Updated response text']), $assignment, $question, $first, $service);
check(DB::table('discuss_it_comments')->where('id', $first)->value('text') === 'Updated response text', 'owner can edit ungraded response');
asUser(2, 3);
$scope = $service->scope($assignment, $question); $scope['settings']['auto_grade'] = true;
$service->grade($assignment, $question, $scope); $service->grade($assignment, $question, $scope);
check(DB::table('submission_files')->count() === 1 && (float) DB::table('scores')->value('score') === 2.0, 'completion grading updates score once');
denied(function () use ($controller, $assignment, $question, $service, $first) { $controller->update(asUser(2, 3, ['text' => 'Cannot edit graded']), $assignment, $question, $first, $service); }, 403, 'graded response locked');
asUser(1, 2); $controller->destroy($assignment, $question, $first, $service);
check(DB::table('discuss_it_comments')->where('id', $first)->value('deleted_at') !== null, 'instructor can moderate without deleting stored record');
check(DB::table('submission_files')->count() === 1, 'moderation preserves existing grade');
$sizeGuard = new App\Http\Middleware\ValidateDiscussItPostSize();
$largeRequest = Request::create('/api/discuss-it/1/10/media/test/content', 'PUT', [], [], [], ['CONTENT_LENGTH' => 25000000]);
check($sizeGuard->handle($largeRequest, function () { return 'accepted'; }) === 'accepted', 'video PUT uses its scoped 80 MB limit');
$oversize = Request::create('/api/discuss-it/1/10/media/test/content', 'PUT', [], [], [], ['CONTENT_LENGTH' => 80000001]);
denied(function () use ($sizeGuard, $oversize) { $sizeGuard->handle($oversize, function () {}); }, 413, 'oversized video rejected before processing');
$ordinary = Request::create('/api/questions', 'POST', [], [], [], ['CONTENT_LENGTH' => 25000000]);
denied(function () use ($sizeGuard, $ordinary) { $sizeGuard->handle($ordinary, function () {}); }, 413, 'unrelated upload limits unchanged');
$request = asUser(2, 3);
$limiter = app(Illuminate\Cache\RateLimiter::class);
for ($i = 0; $i < 20; $i++) $limiter->hit(sha1('2'), 60);
$throttle = app(Illuminate\Routing\Middleware\ThrottleRequests::class);
check($throttle->handle($request, function () { return response('ok'); }, 10, 1, 'discuss-it-upload')->getStatusCode() === 200, 'ordinary API traffic does not consume upload quota');
for ($i = 0; $i < 10; $i++) $limiter->hit('discuss-it-upload'.sha1('2'), 60);
denied(function () use ($throttle, $request) { $throttle->handle($request, function () { return response('ok'); }, 10, 1, 'discuss-it-upload'); }, 429, 'dedicated upload quota remains enforced');
$questionLoader = new App\Http\Controllers\AssignmentSyncQuestionController();
$discussionQuestion = new App\Question(); $discussionQuestion->id = 135;
$discussionQuestion->qti_json = json_encode(['questionType' => 'discuss_it', 'prompt' => '<p>Introduce yourself.</p>']);
check($questionLoader->getAssignmentQuestionSeed($assignment, $discussionQuestion, [], [], 'qti') === '', 'standard assessment loader accepts Discuss-It without answer randomization');
echo "Completed $passed checks using SQLite memory only.\n";
$finished = true;
