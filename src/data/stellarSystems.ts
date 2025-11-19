export interface StellarPlanet {
  name: string
  semiMajorAxisAu: number
  radiusEarth: number
  orbitalEccentricity?: number
}

export interface StellarSystem {
  id: string
  name: string
  starType: string
  galacticPosition: { x: number; y: number; z: number }
  planets: StellarPlanet[]
}

export const REAL_STELLAR_SYSTEMS: StellarSystem[] = [
  {
    id: 'kepler-90',
    name: 'Kepler-90',
    starType: 'G0V',
    galacticPosition: { x: 8100, y: 120, z: -35 },
    planets: [
      { name: 'Kepler-90 b', semiMajorAxisAu: 0.074, radiusEarth: 1.31 },
      { name: 'Kepler-90 c', semiMajorAxisAu: 0.089, radiusEarth: 1.18 },
      { name: 'Kepler-90 d', semiMajorAxisAu: 0.32, radiusEarth: 2.88 },
      { name: 'Kepler-90 e', semiMajorAxisAu: 0.42, radiusEarth: 2.67 },
      { name: 'Kepler-90 f', semiMajorAxisAu: 0.48, radiusEarth: 2.86 },
      { name: 'Kepler-90 g', semiMajorAxisAu: 0.71, radiusEarth: 8.1 },
      { name: 'Kepler-90 h', semiMajorAxisAu: 1.01, radiusEarth: 10.0 }
    ]
  },
  {
    id: 'trappist-1',
    name: 'TRAPPIST-1',
    starType: 'M8V',
    galacticPosition: { x: 8105, y: 110, z: -20 },
    planets: [
      { name: 'TRAPPIST-1 b', semiMajorAxisAu: 0.011, radiusEarth: 1.09 },
      { name: 'TRAPPIST-1 c', semiMajorAxisAu: 0.015, radiusEarth: 1.06 },
      { name: 'TRAPPIST-1 d', semiMajorAxisAu: 0.021, radiusEarth: 0.77 },
      { name: 'TRAPPIST-1 e', semiMajorAxisAu: 0.028, radiusEarth: 0.92 },
      { name: 'TRAPPIST-1 f', semiMajorAxisAu: 0.037, radiusEarth: 1.05 },
      { name: 'TRAPPIST-1 g', semiMajorAxisAu: 0.045, radiusEarth: 1.13 },
      { name: 'TRAPPIST-1 h', semiMajorAxisAu: 0.062, radiusEarth: 0.72 }
    ]
  },
  {
    id: 'kepler-11',
    name: 'Kepler-11',
    starType: 'G2V',
    galacticPosition: { x: 8120, y: 140, z: 15 },
    planets: [
      { name: 'Kepler-11 b', semiMajorAxisAu: 0.091, radiusEarth: 1.80 },
      { name: 'Kepler-11 c', semiMajorAxisAu: 0.106, radiusEarth: 2.87 },
      { name: 'Kepler-11 d', semiMajorAxisAu: 0.159, radiusEarth: 3.12 },
      { name: 'Kepler-11 e', semiMajorAxisAu: 0.194, radiusEarth: 4.19 },
      { name: 'Kepler-11 f', semiMajorAxisAu: 0.25, radiusEarth: 2.61 },
      { name: 'Kepler-11 g', semiMajorAxisAu: 0.466, radiusEarth: 3.33 }
    ]
  },
  {
    id: 'hd-10180',
    name: 'HD 10180',
    starType: 'G1V',
    galacticPosition: { x: 8050, y: 160, z: -10 },
    planets: [
      { name: 'HD 10180 c', semiMajorAxisAu: 0.064, radiusEarth: 2.2 },
      { name: 'HD 10180 d', semiMajorAxisAu: 0.13, radiusEarth: 3.6 },
      { name: 'HD 10180 e', semiMajorAxisAu: 0.27, radiusEarth: 5.3 },
      { name: 'HD 10180 f', semiMajorAxisAu: 0.49, radiusEarth: 7.0 },
      { name: 'HD 10180 g', semiMajorAxisAu: 1.42, radiusEarth: 10.4 },
      { name: 'HD 10180 h', semiMajorAxisAu: 3.4, radiusEarth: 12.0 }
    ]
  }
]
