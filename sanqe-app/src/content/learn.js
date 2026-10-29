// Revision sheets for the five practice topics.
// Numeric tables are generated in code (not typed by hand) so they can't
// contain typos. Every worked example below has been checked by hand.

const round2 = (n) => Math.round(n * 100) / 100

export const SQUARES = Array.from({ length: 30 }, (_, i) => ({ n: i + 1, v: (i + 1) ** 2 }))
export const CUBES = Array.from({ length: 20 }, (_, i) => ({ n: i + 1, v: (i + 1) ** 3 }))
export const FRACTIONS = Array.from({ length: 19 }, (_, i) => {
  const d = i + 2
  return { label: `1/${d}`, v: round2(100 / d) }
})

export const LEARN = {
  simplification: {
    intro: 'Simplification is pure calculation speed. The goal is to avoid long multiplication — use the order of operations, percentage–fraction swaps and algebraic identities.',
    sections: [
      {
        title: 'Order of operations (BODMAS)',
        points: [
          'Brackets → Of → Division & Multiplication → Addition & Subtraction.',
          '“Of” means multiply, and is done before ÷ and ×: 1/2 of 40 ÷ 4 = 20 ÷ 4 = 5.',
          'Division and multiplication are done left to right, as are addition and subtraction: 48 ÷ 4 × 3 = 12 × 3 = 36 (not 48 ÷ 12).',
        ],
      },
      {
        title: 'Shortcuts',
        points: [
          'x% of y = y% of x → 8% of 50 = 50% of 8 = 4.',
          'a² − b² = (a + b)(a − b) → 32² − 22² = 54 × 10 = 540.',
          'Square of a number ending in 5: n5² = n × (n + 1), then write 25 → 65² = 6 × 7 = 42 → 4225.',
          '× 25 = × 100 ÷ 4 → 36 × 25 = 3600 ÷ 4 = 900.  × 125 = × 1000 ÷ 8 → 48 × 125 = 48000 ÷ 8 = 6000.',
          'Unit-digit check: work out only the last digit of the answer first — it often eliminates three options at once.',
          'For “find x” questions, move the known part across first: 80% of x − 200 = 600 → 80% of x = 800 → x = 1000.',
        ],
      },
    ],
    tables: ['fractions', 'squares', 'cubes'],
  },
  approximation: {
    intro: 'In approximation the options are far apart, so you never need exact values. Round every term to a friendly number and calculate in your head.',
    sections: [
      {
        title: 'How to round',
        points: [
          'Decimals → nearest whole number: 24.97 → 25, 59.06 → 59, 399.96 → 400.',
          'Square roots → nearest perfect square: √780 ≈ 28 (28² = 784), √1442 ≈ 38 (38² = 1444), √290 ≈ 17 (17² = 289).',
          'Percentages → nearest friendly value: 19.98% → 20%, 24.9% → 25% (= 1/4).',
          'Divisions → make the divisor round: 2950.01 ÷ 59.06 ≈ 2950 ÷ 59 = 50.',
        ],
      },
      {
        title: 'Strategy',
        points: [
          'Round first, then apply BODMAS — never calculate with the raw decimals.',
          'If two options are close, round one term up and another down so the errors cancel.',
          'For “? ” on the right side (e.g. 400 × ? = 2000), solve for ? last: ? = 2000 ÷ 400 = 5.',
          'A quick sense check: the answer must be the same size as your rough estimate. Wildly different? Recheck the rounding, not the arithmetic.',
        ],
      },
    ],
    tables: ['squares', 'cubes', 'fractions'],
  },
  number_series: {
    intro: 'Every series follows one rule. Test the common rules in this order and you will crack most series within 20 seconds.',
    sections: [
      {
        title: 'Check in this order',
        points: [
          'Differences: 5, 9, 15, 23, 33 → differences 4, 6, 8, 10 (step +2) → next 33 + 12 = 45.',
          'Second differences: if the first differences aren’t regular, take differences again.',
          'Multiplication: 3, 6, 12, 24 → × 2 each time. Growth that speeds up fast means × or squares.',
          'Changing multiplier: 2, 6, 24, 120, 720 → × 3, × 4, × 5, × 6 → next 720 × 7 = 5040.',
          '× n + k: 2, 5, 11, 23, 47 → × 2 + 1 → next 95.',
          'Division: 2187, 729, 243, 81 → ÷ 3 each time.',
        ],
      },
      {
        title: 'Special patterns',
        points: [
          'Squares / cubes: 0, 1, 4, 9, 16, 25 → n². 1331, 729, 343, 125 → 11³, 9³, 7³, 5³ → next 3³ = 27.',
          'Square or cube ± k: 2, 5, 10, 17, 26 → n² + 1.',
          'Prime-number differences: differences 2, 3, 5, 7, 11, 13 …',
          'Two series mixed together: odd positions follow one rule, even positions another (1, 10, 3, 20, 5, 30 …).',
          'Alternating operations: × 2, + 3, × 2, + 3 …',
        ],
      },
    ],
    tables: ['squares', 'cubes'],
  },
  wrong_number_series: {
    intro: 'A wrong-number series is a normal series with one term changed. Find the rule from the terms that agree with each other, then recompute every term.',
    sections: [
      {
        title: 'Method',
        points: [
          'Use the first three or four terms to guess the rule, then confirm it on the rest.',
          'Recompute every term from its neighbour; the one that doesn’t match is the wrong number.',
          'The wrong term breaks two steps — the step into it and the step out of it. If only the last step breaks, the last term is wrong.',
          'If your rule fails in two separate places, the rule is wrong, not the series. Try the next pattern.',
        ],
      },
      {
        title: 'Worked examples',
        points: [
          '2, 5, 14, 41, 125, 365 → rule × 3 − 1: 2 → 5 → 14 → 41 → 122 → 365. 125 should be 122.',
          '16, 4, 8, 2, 6, 1 → rule ÷ 4, × 2 alternating: 16 → 4 → 8 → 2 → 4 → 1. 6 should be 4.',
          '256, 400, 576, 788, 1024 → squares of 16, 20, 24, 28, 32. 788 should be 784 (28²).',
        ],
      },
    ],
    tables: ['squares', 'cubes'],
  },
  quadratic_equations: {
    intro: 'You don’t need both roots exactly — you need to know where x’s roots sit compared with y’s. Signs alone often decide it.',
    sections: [
      {
        title: 'Finding roots fast',
        points: [
          'For x² + bx + c = 0, find two numbers whose product is c and whose sum is b; the roots are those numbers with signs flipped.',
          'x² − 8x + 15 = 0 → (−3)(−5) = 15 and −3 + (−5) = −8 → (x − 3)(x − 5) = 0 → x = 3, 5.',
          'For ax² + bx + c = 0, split the middle term using two numbers with product a × c and sum b: 2x² − 7x + 6 = 0 → −3 and −4 (product 12, sum −7) → 2x² − 4x − 3x + 6 = (2x − 3)(x − 2) → x = 1.5, 2.',
          'x² = k gives x = +√k and −√k: x² − 4 = 0 → x = 2, −2.',
        ],
      },
      {
        title: 'Sign rule (equation written as x² + bx + c = 0)',
        points: [
          'b positive, c positive → both roots negative (x² + 5x + 6 → −2, −3).',
          'b negative, c positive → both roots positive (x² − 5x + 6 → 2, 3).',
          'b positive, c negative → one positive, one negative; the larger one in size is negative (x² + x − 6 → 2, −3).',
          'b negative, c negative → one positive, one negative; the larger one in size is positive (x² − x − 6 → 3, −2).',
        ],
      },
      {
        title: 'Comparing x and y',
        points: [
          'Compare every root of x with every root of y.',
          'Every x bigger than every y → x > y. Every x bigger or equal (at least one tie) → x ≥ y.',
          'Mirror rules give x < y and x ≤ y. A single shared value with no other roots → x = y.',
          'If some pairs go one way and some the other → relationship cannot be determined.',
          'Example: x = 3, 5 and y = −7, −10 → every x is bigger → x > y.',
        ],
      },
    ],
    tables: ['squares'],
  },
}
