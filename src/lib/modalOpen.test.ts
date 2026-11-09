import { afterEach, describe, expect, it } from 'vitest'
import { isModalOpen, modalOpened, resetModalOpen } from './modalOpen'

afterEach(resetModalOpen)

describe('boîtes de dialogue ouvertes', () => {
  it('compte les boîtes ouvertes, même imbriquées', () => {
    expect(isModalOpen()).toBe(false)
    const a = modalOpened()
    const b = modalOpened()
    expect(isModalOpen()).toBe(true)
    a()
    expect(isModalOpen()).toBe(true)
    b()
    expect(isModalOpen()).toBe(false)
  })
  it('fermer deux fois la même boîte ne retire pas celle d’un autre', () => {
    const a = modalOpened()
    const b = modalOpened()
    a()
    a()
    expect(isModalOpen()).toBe(true)
    b()
    expect(isModalOpen()).toBe(false)
  })
})
