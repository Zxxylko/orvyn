<?php

namespace App\Services\Lms;

use RuntimeException;

/** Only user-safe messages; never attach a transport exception containing the feed token. */
class LmsSyncException extends RuntimeException {}
