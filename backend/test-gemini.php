<?php

require __DIR__.'/vendor/autoload.php';

use App\Services\AI\GeminiService;
use Illuminate\Support\Facades\Artisan;

// Bootstrap Laravel
$app = require_once __DIR__.'/bootstrap/app.php';
$app->make('Illuminate\Contracts\Console\Kernel')->bootstrap();

echo "🧪 Testing Gemini API Integration\n";
echo "================================\n\n";

$gemini = new GeminiService();

// Test 1: Task Parsing
echo "Test 1: Smart Task Parsing\n";
echo "---------------------------\n";
$input = "Machine learning project due next Monday high priority 5 hours";
echo "Input: \"$input\"\n\n";

try {
    $result = $gemini->parseTask($input);
    
    if ($result['ai_processed']) {
        echo "✅ SUCCESS! Gemini API is working!\n\n";
        echo "Parsed Result:\n";
        echo "  Title: {$result['title']}\n";
        echo "  Deadline: {$result['deadline']}\n";
        echo "  Priority: {$result['priority']}\n";
        echo "  Duration: {$result['duration_minutes']} minutes\n";
        echo "  Difficulty: {$result['difficulty']}/5\n";
        echo "  Category: {$result['category']}\n";
        echo "  AI Processed: " . ($result['ai_processed'] ? 'Yes' : 'No') . "\n";
    } else {
        echo "⚠️  Using fallback parser (API key not set or invalid)\n\n";
        echo "Parsed Result:\n";
        echo "  Title: {$result['title']}\n";
        echo "  Priority: {$result['priority']}\n";
        echo "  Duration: {$result['duration_minutes']} minutes\n";
        echo "  AI Processed: No (fallback)\n";
    }
} catch (Exception $e) {
    echo "❌ ERROR: " . $e->getMessage() . "\n";
}

echo "\n";

// Test 2: Embedding Generation
echo "Test 2: Embedding Generation\n";
echo "----------------------------\n";
$text = "Complete operating systems lab assignment on process scheduling";
echo "Text: \"$text\"\n\n";

try {
    $embedding = $gemini->generateEmbedding($text);
    
    if ($embedding && is_array($embedding)) {
        echo "✅ SUCCESS! Embedding generated!\n";
        echo "  Dimensions: " . count($embedding) . "\n";
        echo "  First 5 values: [" . implode(', ', array_slice($embedding, 0, 5)) . "...]\n";
    } else {
        echo "⚠️  Embedding generation failed (API key not set or invalid)\n";
    }
} catch (Exception $e) {
    echo "❌ ERROR: " . $e->getMessage() . "\n";
}

echo "\n================================\n";
echo "Testing complete!\n";
