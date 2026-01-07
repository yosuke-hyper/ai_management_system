import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { StoreSelector } from '../StoreSelector'

describe('StoreSelector', () => {
  const mockStores = [
    { id: 'store-1', name: 'Store 1' },
    { id: 'store-2', name: 'Store 2' },
    { id: 'store-3', name: 'Store 3' }
  ]

  const mockOnChange = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Rendering', () => {
    it('should render without crashing', () => {
      render(
        <StoreSelector
          stores={mockStores}
          selectedStoreId="store-1"
          onChange={mockOnChange}
        />
      )
      expect(screen.getByRole('combobox')).toBeInTheDocument()
    })

    it('should display all stores as options', () => {
      render(
        <StoreSelector
          stores={mockStores}
          selectedStoreId="store-1"
          onChange={mockOnChange}
        />
      )

      const select = screen.getByRole('combobox')
      const options = select.querySelectorAll('option')

      // +1 for "All Stores" option
      expect(options.length).toBe(mockStores.length + 1)
    })

    it('should display "All Stores" option', () => {
      render(
        <StoreSelector
          stores={mockStores}
          selectedStoreId={null}
          onChange={mockOnChange}
        />
      )
      expect(screen.getByText(/全店舗/)).toBeInTheDocument()
    })
  })

  describe('Selection', () => {
    it('should show selected store', () => {
      render(
        <StoreSelector
          stores={mockStores}
          selectedStoreId="store-2"
          onChange={mockOnChange}
        />
      )

      const select = screen.getByRole('combobox') as HTMLSelectElement
      expect(select.value).toBe('store-2')
    })

    it('should call onChange when selection changes', () => {
      render(
        <StoreSelector
          stores={mockStores}
          selectedStoreId="store-1"
          onChange={mockOnChange}
        />
      )

      const select = screen.getByRole('combobox')
      fireEvent.change(select, { target: { value: 'store-2' } })

      expect(mockOnChange).toHaveBeenCalledWith('store-2')
    })

    it('should call onChange with null for all stores', () => {
      render(
        <StoreSelector
          stores={mockStores}
          selectedStoreId="store-1"
          onChange={mockOnChange}
        />
      )

      const select = screen.getByRole('combobox')
      fireEvent.change(select, { target: { value: '' } })

      expect(mockOnChange).toHaveBeenCalledWith(null)
    })
  })

  describe('Edge cases', () => {
    it('should handle empty stores array', () => {
      render(
        <StoreSelector
          stores={[]}
          selectedStoreId={null}
          onChange={mockOnChange}
        />
      )

      const select = screen.getByRole('combobox')
      const options = select.querySelectorAll('option')

      // Only "All Stores" option should be present
      expect(options.length).toBe(1)
    })

    it('should handle null selectedStoreId', () => {
      render(
        <StoreSelector
          stores={mockStores}
          selectedStoreId={null}
          onChange={mockOnChange}
        />
      )

      const select = screen.getByRole('combobox') as HTMLSelectElement
      expect(select.value).toBe('')
    })

    it('should handle undefined selectedStoreId', () => {
      render(
        <StoreSelector
          stores={mockStores}
          selectedStoreId={undefined}
          onChange={mockOnChange}
        />
      )

      const select = screen.getByRole('combobox') as HTMLSelectElement
      expect(select.value).toBe('')
    })
  })

  describe('Disabled state', () => {
    it('should be disabled when disabled prop is true', () => {
      render(
        <StoreSelector
          stores={mockStores}
          selectedStoreId="store-1"
          onChange={mockOnChange}
          disabled={true}
        />
      )

      const select = screen.getByRole('combobox')
      expect(select).toBeDisabled()
    })

    it('should not call onChange when disabled', () => {
      render(
        <StoreSelector
          stores={mockStores}
          selectedStoreId="store-1"
          onChange={mockOnChange}
          disabled={true}
        />
      )

      const select = screen.getByRole('combobox')
      fireEvent.change(select, { target: { value: 'store-2' } })

      expect(mockOnChange).not.toHaveBeenCalled()
    })
  })

  describe('Store names', () => {
    it('should display store names correctly', () => {
      render(
        <StoreSelector
          stores={mockStores}
          selectedStoreId="store-1"
          onChange={mockOnChange}
        />
      )

      expect(screen.getByText('Store 1')).toBeInTheDocument()
      expect(screen.getByText('Store 2')).toBeInTheDocument()
      expect(screen.getByText('Store 3')).toBeInTheDocument()
    })

    it('should handle stores with special characters in names', () => {
      const specialStores = [
        { id: 'store-1', name: 'Store & Restaurant' },
        { id: 'store-2', name: 'Café "Le Bon"' },
        { id: 'store-3', name: '居酒屋<勝>>' }
      ]

      render(
        <StoreSelector
          stores={specialStores}
          selectedStoreId="store-1"
          onChange={mockOnChange}
        />
      )

      expect(screen.getByText('Store & Restaurant')).toBeInTheDocument()
      expect(screen.getByText('Café "Le Bon"')).toBeInTheDocument()
    })
  })
})
