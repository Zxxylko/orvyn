<?php

namespace App\Services\Lms;

use Illuminate\Support\Str;

/** Moodle's calendar exports shortnames, not course fullnames. */
class LmsCourseCatalog
{
    // Verified 2026-10-10 against the regular Informatics curriculum:
    // https://bif.telkomuniversity.ac.id/kurikulum-reguler-2024/
    // Religion code: https://bis.telkomuniversity.ac.id/agama-s1-sistem-informasi-telkomuniversity/
    private const NAMES = [
        'CAK1BAB3' => 'Algoritma dan Pemrograman 1',
        'CAK1CAB3' => 'Kalkulus',
        'CAK1DAB3' => 'Logika Matematika',
        'CAK1EAB3' => 'Matematika Diskrit',
        'CAK1GDB2' => 'Pendidikan Karakter',
        'CAK1HDB2' => 'Statistika',
        'UBKXBCB2' => 'Pancasila',
        'UAKXACB2' => 'Agama Islam',
    ];

    /** Keep the original class code; only resolve verified Informatics shortnames. */
    public function resolve(string $category): array
    {
        $category = trim(html_entity_decode(strip_tags($category), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
        $practical = preg_match('/^PRAK-\d+-([A-Z0-9]{8})-IF$/D', $category, $match) === 1;
        $coded = $practical || preg_match('/^([A-Z0-9]{8})(?:-BS1IF-\d+-REG(?:-GAB)?\d+[a-z]?)?$/D', $category, $match) === 1;
        $name = $coded ? (self::NAMES[$match[1]] ?? null) : null;

        return [
            'course_name' => Str::limit($name ? ($practical ? 'Praktikum '.$name : $name) : ($category ?: 'LMS Telkom'), 100, ''),
            'course_code' => $coded ? Str::limit($category, 100, '') : null,
        ];
    }
}
