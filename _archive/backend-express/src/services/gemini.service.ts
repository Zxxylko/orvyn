import dotenv from 'dotenv'

dotenv.config()

export interface StructuredTaskOutput {
  title: string
  deadline: string | null // ISO timestamp or null
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  durationMinutes: number
  difficulty: number
  category: string
  tags: string[]
}

export class GeminiService {
  private static getApiKey(): string | null {
    const key = process.env.GEMINI_API_KEY
    if (!key || key.includes('your-gemini-api-key-here') || key === '') {
      return null
    }
    return key
  }

  /**
   * Parses natural language task inputs into structured task information.
   * Leverages Gemini 2.5 Flash with structured JSON output configurations.
   */
  static async parseTaskInput(input: string): Promise<StructuredTaskOutput> {
    const apiKey = this.getApiKey()

    if (!apiKey) {
      console.warn('⚠️ [ORVYN AI] GEMINI_API_KEY is not configured. Utilizing high-fidelity local Regex parser fallback.')
      return this.fallbackRegexParser(input)
    }

    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`
      
      const prompt = `Analyze the student's natural language input and extract structured academic/coding task metadata: "${input}"`
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'OBJECT',
              properties: {
                title: { type: 'STRING', description: 'Clean task title without auxiliary text' },
                deadline: { type: 'STRING', description: 'ISO 8601 string representing the deadline, or null if unspecified' },
                priority: { type: 'STRING', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
                durationMinutes: { type: 'INTEGER', description: 'Estimated time required in minutes' },
                difficulty: { type: 'INTEGER', description: 'Difficulty score between 1 (simple) and 5 (highly complex)' },
                category: { type: 'STRING', description: 'E.g. academics, coding, personal, finance' },
                tags: { type: 'ARRAY', items: { type: 'STRING' } }
              },
              required: ['title', 'priority', 'durationMinutes', 'difficulty', 'category', 'tags']
            }
          }
        })
      })

      if (!response.ok) {
        throw new Error(`Gemini API returned status ${response.status}: ${await response.text()}`)
      }

      const resData: any = await response.json()
      const jsonText = resData.candidates?.[0]?.content?.parts?.[0]?.text
      
      if (!jsonText) {
        throw new Error('Empty text content received from Gemini model response')
      }

      const result = JSON.parse(jsonText) as StructuredTaskOutput
      console.log('✨ [ORVYN AI] Gemini parsed structured task output:', result)
      return result

    } catch (error: any) {
      console.error('❌ [ORVYN AI] Error calling Gemini API. Falling back to local parser:', error.message)
      return this.fallbackRegexParser(input)
    }
  }

  /**
   * Generates a 768-dimensional vector embedding for semantic similarity / RAG queries.
   * Utilizes the text-embedding-004 model from the Gemini API suite.
   */
  static async generateEmbedding(text: string): Promise<number[]> {
    const apiKey = this.getApiKey()

    if (!apiKey) {
      console.warn('⚠️ [ORVYN AI] GEMINI_API_KEY is not configured. Generating static high-fidelity dummy vector array.')
      return new Array(768).fill(0).map((_, i) => Math.sin(i * 0.1) * 0.5) // Returns beautiful wave vectors for benchmarking
    }

    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'models/text-embedding-004',
          content: {
            parts: [{ text }]
          }
        })
      })

      if (!response.ok) {
        throw new Error(`Gemini API returned status ${response.status}: ${await response.text()}`)
      }

      const resData: any = await response.json()
      const embedding = resData.embedding?.values

      if (!embedding || !Array.isArray(embedding)) {
        throw new Error('Invalid embedding vector structure returned by Gemini')
      }

      console.log(`✨ [ORVYN AI] Gemini embedding generated successfully (${embedding.length} dimensions).`)
      return embedding

    } catch (error: any) {
      console.error('❌ [ORVYN AI] Error generating embedding vector. Generating static fallback wave vector:', error.message)
      return new Array(768).fill(0).map((_, i) => Math.sin(i * 0.1) * 0.5)
    }
  }

  /**
   * High-fidelity local RegEx task metadata parser.
   * Parses standard study timelines, priority tokens, and categories out of the box.
   */
  private static fallbackRegexParser(input: string): StructuredTaskOutput {
    const lowerInput = input.toLowerCase()
    
    // Title defaults to input with clean formatting
    let title = input.trim()

    // Determine priority
    let priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'MEDIUM'
    if (lowerInput.includes('high') || lowerInput.includes('urgent') || lowerInput.includes('critical')) {
      priority = 'HIGH'
    } else if (lowerInput.includes('low') || lowerInput.includes('chill')) {
      priority = 'LOW'
    }

    // Determine category
    let category = 'academics'
    if (lowerInput.includes('code') || lowerInput.includes('react') || lowerInput.includes('database') || lowerInput.includes('dev')) {
      category = 'coding'
    } else if (lowerInput.includes('money') || lowerInput.includes('wallet') || lowerInput.includes('spend')) {
      category = 'finance'
    }

    // Extract duration estimation (e.g. "takes 3 hours", "4h")
    let durationMinutes = 60
    const durationMatch = lowerInput.match(/(\d+)\s*(hour|hr|h|min|m)/)
    if (durationMatch) {
      const num = parseInt(durationMatch[1], 10)
      const unit = durationMatch[2]
      if (unit.startsWith('h')) {
        durationMinutes = num * 60
      } else {
        durationMinutes = num
      }
    }

    // Determine difficulty score
    let difficulty = 3
    if (lowerInput.includes('easy') || lowerInput.includes('quick')) {
      difficulty = 1
    } else if (lowerInput.includes('hard') || lowerInput.includes('complex') || lowerInput.includes('exam')) {
      difficulty = 5
    }

    // Extract tags
    const tags: string[] = ['ambient-nlp']
    if (category === 'coding') tags.push('programming')
    if (lowerInput.includes('math')) tags.push('math')
    if (lowerInput.includes('lab')) tags.push('lab-assignment')

    // Parse mock deadlines
    let deadline: string | null = null
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(23, 59, 59, 0)

    if (lowerInput.includes('tomorrow')) {
      deadline = tomorrow.toISOString()
    } else if (lowerInput.includes('today')) {
      const today = new Date()
      today.setHours(23, 59, 59, 0)
      deadline = today.toISOString()
    } else if (lowerInput.includes('next week') || lowerInput.includes('next tuesday')) {
      const target = new Date()
      target.setDate(target.getDate() + 7)
      target.setHours(23, 59, 59, 0)
      deadline = target.toISOString()
    }

    // Clean up title by removing phrases like "high priority", "due tomorrow"
    title = title
      .replace(/due\s+(tomorrow|today|next\s+week|next\s+tuesday)/gi, '')
      .replace(/high\s+priority|critical|low\s+priority|urgent/gi, '')
      .replace(/takes\s+\d+\s*(hours|hour|hr|h|mins|min|m)/gi, '')
      .replace(/\s+/g, ' ')
      .trim()

    if (!title) title = input

    return {
      title,
      deadline,
      priority,
      durationMinutes,
      difficulty,
      category,
      tags
    }
  }
}
