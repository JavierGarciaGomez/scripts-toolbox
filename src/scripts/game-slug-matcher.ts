import * as XLSX from 'xlsx';
import { compareTwoStrings } from 'string-similarity';
import * as fs from 'fs';
import * as path from 'path';

interface VideoGame {
  name: string;
  releaseYear: number;
}

interface FetchedGame {
  title: string;
  premiereYear: number;
  slug: string;
}

interface MatchResult {
  originalName: string;
  originalYear: number;
  matchedTitle: string;
  matchedYear: number;
  slug: string;
  confidenceScore: number;
  yearDifference: number;
}

/**
 * Convierte números romanos comunes a arábigos
 */
function romanToArabic(roman: string): number {
  const romanMap: { [key: string]: number } = {
    I: 1,
    II: 2,
    III: 3,
    IV: 4,
    V: 5,
    VI: 6,
    VII: 7,
    VIII: 8,
    IX: 9,
    X: 10,
  };
  return romanMap[roman.toUpperCase()] || 0;
}

/**
 * Normaliza el nombre del juego para mejor matching:
 * - Convierte números romanos a arábigos (II → 2, III → 3)
 * - Normaliza variantes (Part II → Part 2, Episode II → Episode 2)
 * - Elimina años entre paréntesis (Game (2001) → Game)
 */
function normalizeGameName(name: string): string {
  let normalized = name.trim();

  // Eliminar años entre paréntesis: "Silent Hill 2 (2001)" → "Silent Hill 2"
  normalized = normalized.replace(/\s*\((\d{4})\)\s*/g, ' ');

  // Patrones comunes de secuelas con números romanos
  const patterns = [
    // "Game II" al final → "Game 2"
    { regex: /\s+([IVX]+)$/, replacement: ' $1' },
    // "Game: Part II" → "Game: Part 2"
    { regex: /Part\s+([IVX]+)/gi, replacement: 'Part $1' },
    // "Game Episode II" → "Game Episode 2"
    { regex: /Episode\s+([IVX]+)/gi, replacement: 'Episode $1' },
    // "Game Chapter II" → "Game Chapter 2"
    { regex: /Chapter\s+([IVX]+)/gi, replacement: 'Chapter $1' },
  ];

  patterns.forEach(({ regex, replacement }) => {
    normalized = normalized.replace(regex, (match, roman) => {
      const arabic = romanToArabic(roman);
      if (arabic > 0) {
        return replacement.replace('$1', arabic.toString());
      }
      return match;
    });
  });

  // Limpiar espacios extras
  normalized = normalized.replace(/\s+/g, ' ').trim();

  return normalized.toLowerCase();
}

/**
 * Calcula similitud entre dos juegos considerando nombre y año
 * @param name1 Nombre del primer juego
 * @param year1 Año del primer juego
 * @param name2 Nombre del segundo juego
 * @param year2 Año del segundo juego
 * @returns Score de similitud (0-1)
 */
function calculateSimilarity(
  name1: string,
  year1: number,
  name2: string,
  year2: number
): number {
  // Normalizar nombres (convertir números romanos a arábigos)
  const normalizedName1 = normalizeGameName(name1);
  const normalizedName2 = normalizeGameName(name2);

  // Similitud de nombres (algoritmo Dice Coefficient)
  const nameSimilarity = compareTwoStrings(normalizedName1, normalizedName2);

  // Bonus/penalty por año (más peso si los nombres son muy similares)
  const yearDiff = Math.abs(year1 - year2);
  let yearAdjustment = 0;

  // Si los nombres son muy similares (>90%), dar MÁS peso al año
  const yearWeight = nameSimilarity > 0.9 ? 2 : 1;

  if (yearDiff === 0) {
    // Año exacto: gran bonus
    yearAdjustment = 0.15 * yearWeight;
  } else if (yearDiff === 1) {
    // 1 año de diferencia: buen bonus
    yearAdjustment = 0.08 * yearWeight;
  } else if (yearDiff === 2) {
    // 2 años: pequeño bonus
    yearAdjustment = 0.04 * yearWeight;
  } else if (yearDiff >= 3 && yearDiff <= 5) {
    // 3-5 años: pequeño penalty
    yearAdjustment = -0.03 * yearWeight;
  } else if (yearDiff > 5 && yearDiff <= 10) {
    // 6-10 años: penalty moderado
    yearAdjustment = -0.08 * yearWeight;
  } else if (yearDiff > 10) {
    // Más de 10 años: penalty fuerte
    yearAdjustment = -0.15 * yearWeight;
  }

  // Combinar score (rango 0-1)
  return Math.max(0, Math.min(nameSimilarity + yearAdjustment, 1.0));
}

/**
 * Encuentra el mejor match para un juego en la lista de fetched
 */
function findBestMatch(
  gameName: string,
  gameYear: number,
  fetchedGames: FetchedGame[]
): { game: FetchedGame; score: number } | null {
  let bestMatch: FetchedGame | null = null;
  let bestScore = 0;

  for (const fetched of fetchedGames) {
    const score = calculateSimilarity(
      gameName,
      gameYear,
      fetched.title,
      fetched.premiereYear
    );

    if (score > bestScore) {
      bestScore = score;
      bestMatch = fetched;
    }
  }

  return bestMatch ? { game: bestMatch, score: bestScore } : null;
}

async function main() {
  const inputFile = path.join(process.cwd(), 'data/2023-Videojuegos.ods');

  console.log(`Leyendo archivo: ${inputFile}`);

  if (!fs.existsSync(inputFile)) {
    console.error(`Error: El archivo ${inputFile} no existe`);
    process.exit(1);
  }

  const workbook = XLSX.readFile(inputFile);

  // Leer pestaña Videojuegos_2
  const sheet1 = workbook.Sheets['Videojuegos_2'];
  if (!sheet1) {
    console.error('Error: No se encontró la pestaña "Videojuegos_2"');
    process.exit(1);
  }
  const data1: any[][] = XLSX.utils.sheet_to_json(sheet1, { header: 1 });

  // Leer pestaña fetched
  const sheet2 = workbook.Sheets['fetched'];
  if (!sheet2) {
    console.error('Error: No se encontró la pestaña "fetched"');
    process.exit(1);
  }
  const data2: any[][] = XLSX.utils.sheet_to_json(sheet2, { header: 1 });

  // Parse videojuegos (saltar header en fila 0)
  const videoGames: VideoGame[] = [];
  for (let i = 1; i < data1.length; i++) {
    const row = data1[i];
    if (row && row[0]) {
      // Si tiene nombre
      videoGames.push({
        name: String(row[0]),
        releaseYear: Number(row[1]) || 0,
      });
    }
  }

  // Parse fetched games (saltar header en fila 0)
  const fetchedGames: FetchedGame[] = [];
  for (let i = 1; i < data2.length; i++) {
    const row = data2[i];
    if (row && row[0]) {
      fetchedGames.push({
        title: String(row[0]),
        premiereYear: Number(row[1]) || 0,
        slug: String(row[33]) || '', // Columna slug (índice 33)
      });
    }
  }

  console.log(`\nEncontrados ${videoGames.length} juegos en Videojuegos_2`);
  console.log(`Encontrados ${fetchedGames.length} juegos en fetched`);
  console.log(`\nBuscando mejores matches...\n`);

  // Buscar matches
  const results: MatchResult[] = [];
  let processed = 0;

  for (const game of videoGames) {
    const match = findBestMatch(game.name, game.releaseYear, fetchedGames);

    if (match) {
      results.push({
        originalName: game.name,
        originalYear: game.releaseYear,
        matchedTitle: match.game.title,
        matchedYear: match.game.premiereYear,
        slug: match.game.slug,
        confidenceScore: Math.round(match.score * 100), // Convertir a 0-100
        yearDifference: Math.abs(game.releaseYear - match.game.premiereYear),
      });
    }

    processed++;
    if (processed % 100 === 0) {
      console.log(`  Procesados ${processed}/${videoGames.length}...`);
    }
  }

  // Exportar a Excel y JSON
  const timestamp = new Date().toISOString().split('T')[0];
  const outputExcel = path.join(
    process.cwd(),
    `data/game-slug-matches-${timestamp}.xlsx`
  );
  const outputJson = path.join(
    process.cwd(),
    `data/game-slug-matches-${timestamp}.json`
  );

  // Crear Excel
  const ws = XLSX.utils.json_to_sheet(results);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Matches');
  XLSX.writeFile(wb, outputExcel);

  // Crear JSON
  fs.writeFileSync(outputJson, JSON.stringify(results, null, 2));

  // Resultados
  console.log(`\n✓ Procesados ${results.length} juegos`);
  console.log(`✓ Excel: ${outputExcel}`);
  console.log(`✓ JSON: ${outputJson}`);

  // Estadísticas
  const highConfidence = results.filter((r) => r.confidenceScore >= 80).length;
  const mediumConfidence = results.filter(
    (r) => r.confidenceScore >= 60 && r.confidenceScore < 80
  ).length;
  const lowConfidence = results.filter((r) => r.confidenceScore < 60).length;

  console.log(`\nEstadísticas de confianza:`);
  console.log(`  Alta (≥80%):     ${highConfidence}`);
  console.log(`  Media (60-79%):  ${mediumConfidence}`);
  console.log(`  Baja (<60%):     ${lowConfidence}`);

  // Mostrar algunos ejemplos de baja confianza para revisión manual
  const lowConfidenceExamples = results
    .filter((r) => r.confidenceScore < 60)
    .slice(0, 5);

  if (lowConfidenceExamples.length > 0) {
    console.log(`\nEjemplos de baja confianza (revisar manualmente):`);
    lowConfidenceExamples.forEach((r) => {
      console.log(
        `  "${r.originalName}" (${r.originalYear}) → "${r.matchedTitle}" (${r.matchedYear}) - ${r.confidenceScore}%`
      );
    });
  }
}

main().catch(console.error);
