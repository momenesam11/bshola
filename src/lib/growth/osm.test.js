import { describe, it, expect } from 'vitest'
import { osmToRows, overpassQuery } from './osm'

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

  it('builds a bounded Overpass query', () => {
    expect(overpassQuery([1, 2, 3, 4])).toContain('(1,2,3,4)')
  })
})
