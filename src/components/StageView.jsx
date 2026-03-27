import StageKpiCards from './StageKpiCards';
import DonutChart from './DonutChart';
import BarChart from './BarChart';
import DealsTable from './DealsTable';

export default function StageView({ kpis, charts, columns, deals, sections, onRowClick }) {
  return (
    <div className="flex flex-col gap-8">
      {/* 1. KPI Cards */}
      <StageKpiCards cards={kpis} />

      {/* 2. Charts side by side */}
      {charts && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {charts.donut && <DonutChart {...charts.donut} />}
          {charts.bar && (
            charts.bar.segments
              ? <DonutChart {...charts.bar} />
              : <BarChart {...charts.bar} />
          )}
        </div>
      )}

      {/* 3. Deals table OR sections (Reuniao dual-section FR65) */}
      {sections && sections.length > 0 ? (
        sections.map((section, i) => (
          <div key={section.title}>
            {i > 0 && <hr className="border-t-2 border-border-subtle/30 my-8" />}
            <DealsTable
              columns={section.columns || columns}
              rows={section.deals || []}
              title={section.title}
              subtitle={`${section.deals?.length ?? 0} deals`}
              onRowClick={onRowClick}
            />
          </div>
        ))
      ) : (
        <DealsTable
          columns={columns}
          rows={deals || []}
          title={`${deals?.length || 0} deals`}
          onRowClick={onRowClick}
        />
      )}
    </div>
  );
}
