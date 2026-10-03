import { describe, it, expect } from 'vitest'
import { osmToRows, overpassQuery, osmTarget } from './osm'

const el = (tags, id = 1) => ({ type: 'node', id, tags })

describe('OpenStreetMap leads', () => {
  it('keeps named clinics with a phone and classifies them', () => {
    const rows = osmToRows([
      el({ name: 'عياده اسنان د. محمد طلعت', amenity: 'dentist', phone: '+20222756141' }, 1),
      el({ name: 'مركز ليزر وتجميل', amenity: 'clinic', 'contact:phone': '0101 234 5678; 0222222222', 'addr:suburb': 'المعادي' }, 2),
      el({ name: 'د. ممدوح لبيب', amenity: 'clinic', phone: '+201222128203', website: 'https://x.com' }, 3),
    ])
    expect(rows.map((r) => [r.category, r.phone])).toEqual([
      ['dental', '20222756141'],
      ['derma', '201012345678'],
      ['clinic', '201222128203'],
    ])
    expect(rows[1]).toMatchObject({ area: 'المعادي', google_maps_url: 'https://www.openstreetmap.org/node/2', source_detail: 'OpenStreetMap' })
    expect(rows[0].signals[0].type).toBe('no_website')
    expect(rows[2].signals).toEqual([])
  })

  it('drops pharmacies, hospitals, labs, nameless and phoneless places', () => {
    expect(osmToRows([
      el({ name: 'صيدليه الفتح', amenity: 'clinic', phone: '01278496233' }),
      el({ name: 'مستشفى', amenity: 'hospital', phone: '01000000001' }),
      el({ name: 'معمل تحاليل', amenity: 'clinic', phone: '01000000002' }),
      el({ amenity: 'dentist', phone: '01000000003' }),
      el({ name: 'عيادة', amenity: 'clinic' }),
    ])).toEqual([])
  })

  it('searches a whole governorate by its boundary, or a circle around a district', () => {
    const gov = osmTarget({ governorate: 'cairo' })
    expect(gov).toMatchObject({ target: { areaId: 3604103336 }, governorate: 'القاهرة', area: null })
    expect(overpassQuery(gov.target)).toContain('area(id:3604103336)->.a;')
    const maadi = osmTarget({ governorate: 'cairo', area: 'المعادي', radiusKm: 2 })
    expect(maadi.target).toEqual({ lat: 29.9602, lon: 31.2569, radiusM: 2000 })
    expect(overpassQuery(maadi.target)).toContain('(around:2000,29.9602,31.2569)')
    expect(maadi.label).toBe('المعادي، القاهرة (2 كم)')
    expect(() => osmTarget({ governorate: 'nowhere' })).toThrow()
    expect(() => osmTarget({ governorate: 'giza', area: 'المعادي' })).toThrow()
  })

  it('labels rows with the searched place', () => {
    const [row] = osmToRows([el({ name: 'عيادة', amenity: 'dentist', phone: '01011112222' })], { governorate: 'الجيزة', area: 'الدقي', label: 'الدقي، الجيزة (3 كم)' })
    expect(row).toMatchObject({ city: 'الجيزة', area: 'الدقي', source_detail: 'OpenStreetMap — الدقي، الجيزة (3 كم)' })
  })
})
