<?php

namespace App\Support;

use Illuminate\Http\Request;
use Illuminate\Support\Str;

final class DeviceName
{
    public static function fromRequest(Request $request): string
    {
        $deviceName = strip_tags((string) $request->header('X-Device-Name', ''));
        $deviceName = preg_replace("/[^\p{L}\p{N}\s._()'\-]+/u", ' ', $deviceName) ?? '';
        $deviceName = Str::squish($deviceName);

        return $deviceName === ''
            ? 'Unknown device'
            : Str::limit($deviceName, 80, '');
    }
}
