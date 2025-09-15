class VirtualScrollTable {
    constructor(container, options = {}) {
        this.container = typeof container === 'string' ? 
            document.querySelector(container) : container;
        
        this.options = {
            rowHeight: options.rowHeight || 40,
            visibleRows: options.visibleRows || 15,
            bufferRows: options.bufferRows || 5,
            columns: options.columns || [],
            data: options.data || [],
            onRowClick: options.onRowClick || null,
            formatCell: options.formatCell || null
        };
        
        this.scrollTop = 0;
        this.startIndex = 0;
        this.endIndex = 0;
        this.rafId = null;
        
        this.init();
    }
    
    init() {
        this.createStructure();
        this.bindEvents();
        this.render();
    }
    
    createStructure() {
        this.container.innerHTML = '';
        this.container.className = 'virtual-scroll-container';
        
        // Create wrapper
        this.wrapper = document.createElement('div');
        this.wrapper.className = 'virtual-scroll-wrapper';
        this.wrapper.style.cssText = `
            height: ${this.options.visibleRows * this.options.rowHeight}px;
            overflow-y: auto;
            position: relative;
        `;
        
        // Create scrollable area
        this.scrollArea = document.createElement('div');
        this.scrollArea.className = 'virtual-scroll-area';
        this.scrollArea.style.height = `${this.options.data.length * this.options.rowHeight}px`;
        
        // Create table container
        this.tableContainer = document.createElement('div');
        this.tableContainer.className = 'virtual-table-container';
        this.tableContainer.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
        `;
        
        // Create table
        this.table = document.createElement('table');
        this.table.className = 'virtual-table';
        
        // Create header
        this.createHeader();
        
        // Create tbody for rows
        this.tbody = document.createElement('tbody');
        this.table.appendChild(this.tbody);
        
        // Assemble structure
        this.tableContainer.appendChild(this.table);
        this.scrollArea.appendChild(this.tableContainer);
        this.wrapper.appendChild(this.scrollArea);
        this.container.appendChild(this.wrapper);
    }
    
    createHeader() {
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        
        this.options.columns.forEach(col => {
            const th = document.createElement('th');
            th.textContent = col.label || col.key;
            th.style.width = col.width || 'auto';
            if (col.sortable) {
                th.style.cursor = 'pointer';
                th.dataset.key = col.key;
                th.addEventListener('click', () => this.sortBy(col.key));
            }
            headerRow.appendChild(th);
        });
        
        thead.appendChild(headerRow);
        this.table.appendChild(thead);
    }
    
    bindEvents() {
        this.scrollHandler = this.onScroll.bind(this);
        this.wrapper.addEventListener('scroll', this.scrollHandler);
        
        // Window resize handler
        this.resizeHandler = this.onResize.bind(this);
        window.addEventListener('resize', this.resizeHandler);
    }
    
    onScroll() {
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
        }
        
        this.rafId = requestAnimationFrame(() => {
            this.scrollTop = this.wrapper.scrollTop;
            this.updateVisibleRange();
            this.renderRows();
        });
    }
    
    onResize() {
        const newVisibleRows = Math.ceil(this.wrapper.clientHeight / this.options.rowHeight);
        if (newVisibleRows !== this.options.visibleRows) {
            this.options.visibleRows = newVisibleRows;
            this.updateVisibleRange();
            this.renderRows();
        }
    }
    
    updateVisibleRange() {
        const scrollTop = this.scrollTop;
        const bufferRows = this.options.bufferRows;
        
        this.startIndex = Math.max(0, 
            Math.floor(scrollTop / this.options.rowHeight) - bufferRows
        );
        
        this.endIndex = Math.min(this.options.data.length,
            this.startIndex + this.options.visibleRows + (bufferRows * 2)
        );
    }
    
    renderRows() {
        // Clear existing rows
        this.tbody.innerHTML = '';
        
        // Calculate offset for positioning
        const offsetY = this.startIndex * this.options.rowHeight;
        this.tableContainer.style.transform = `translateY(${offsetY}px)`;
        
        // Render visible rows
        for (let i = this.startIndex; i < this.endIndex; i++) {
            const rowData = this.options.data[i];
            if (!rowData) continue;
            
            const row = this.createRow(rowData, i);
            this.tbody.appendChild(row);
        }
    }
    
    createRow(data, index) {
        const row = document.createElement('tr');
        row.dataset.index = index;
        row.style.height = `${this.options.rowHeight}px`;
        
        this.options.columns.forEach(col => {
            const cell = document.createElement('td');
            let value = data[col.key];
            
            // Custom formatting
            if (this.options.formatCell) {
                value = this.options.formatCell(col.key, value, data);
            } else if (col.formatter) {
                value = col.formatter(value, data);
            }
            
            cell.innerHTML = value;
            row.appendChild(cell);
        });
        
        // Row click handler
        if (this.options.onRowClick) {
            row.style.cursor = 'pointer';
            row.addEventListener('click', () => this.options.onRowClick(data, index));
        }
        
        return row;
    }
    
    setData(newData) {
        this.options.data = newData;
        this.scrollArea.style.height = `${newData.length * this.options.rowHeight}px`;
        this.wrapper.scrollTop = 0;
        this.scrollTop = 0;
        this.updateVisibleRange();
        this.renderRows();
    }
    
    appendData(moreData) {
        this.options.data = [...this.options.data, ...moreData];
        this.scrollArea.style.height = `${this.options.data.length * this.options.rowHeight}px`;
        this.updateVisibleRange();
        this.renderRows();
    }
    
    sortBy(key, direction = 'asc') {
        this.options.data.sort((a, b) => {
            const aVal = a[key];
            const bVal = b[key];
            
            if (aVal === bVal) return 0;
            
            if (direction === 'asc') {
                return aVal > bVal ? 1 : -1;
            } else {
                return aVal < bVal ? 1 : -1;
            }
        });
        
        this.render();
    }
    
    filter(filterFn) {
        const filtered = this.options.data.filter(filterFn);
        this.setData(filtered);
    }
    
    scrollToRow(index) {
        const targetScroll = index * this.options.rowHeight;
        this.wrapper.scrollTop = targetScroll;
    }
    
    render() {
        this.updateVisibleRange();
        this.renderRows();
    }
    
    destroy() {
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
        }
        
        this.wrapper.removeEventListener('scroll', this.scrollHandler);
        window.removeEventListener('resize', this.resizeHandler);
        
        this.container.innerHTML = '';
    }
    
    // Export current view as CSV
    exportToCSV(filename = 'data.csv') {
        const headers = this.options.columns.map(col => col.label || col.key);
        const rows = this.options.data.map(row => 
            this.options.columns.map(col => {
                const value = row[col.key];
                // Escape quotes and wrap in quotes if contains comma
                const stringValue = String(value || '');
                return stringValue.includes(',') ? 
                    `"${stringValue.replace(/"/g, '""')}"` : stringValue;
            })
        );
        
        const csvContent = [
            headers.join(','),
            ...rows.map(r => r.join(','))
        ].join('\n');
        
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
    }
}

// Integration helper for data viewer
class DataViewerTableIntegration {
    static createObservationsTable(container, data) {
        const columns = [
            { key: 'timestamp', label: 'Time', width: '150px', formatter: (v) => new Date(v).toLocaleString() },
            { key: 'station', label: 'Station', width: '100px' },
            { key: 'variable', label: 'Variable', width: '120px' },
            { key: 'value', label: 'Value', width: '80px', formatter: (v) => v?.toFixed(2) || 'N/A' },
            { key: 'units', label: 'Units', width: '80px' }
        ];
        
        return new VirtualScrollTable(container, {
            columns,
            data,
            rowHeight: 35,
            visibleRows: 20,
            bufferRows: 5,
            formatCell: (key, value, row) => {
                if (key === 'station') {
                    const station = window.dataViewer?.targetStations[row.stid];
                    if (station) {
                        return `<span style="color: ${station.color}">${station.name}</span>`;
                    }
                }
                return value;
            }
        });
    }
    
    static updateWithLiveData(table, liveData) {
        // Transform live data to table format
        const tableData = [];
        const timestamp = new Date().toISOString();
        
        liveData.forEach(station => {
            Object.entries(station.observations || {}).forEach(([variable, data]) => {
                tableData.push({
                    timestamp: data.timestamp || timestamp,
                    station: station.name,
                    stid: station.stid,
                    variable,
                    value: data.value,
                    units: data.units
                });
            });
        });
        
        // Prepend new data and limit total rows
        const maxRows = 1000;
        const combinedData = [...tableData, ...table.options.data].slice(0, maxRows);
        table.setData(combinedData);
    }
}