import { createElement, type ReactNode } from 'react';
import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from '@react-pdf/renderer';
import type { PostMortemReportRecord } from './types';

const h = createElement;

const styles = StyleSheet.create({
  page: {
    padding: 36,
    backgroundColor: '#fbfaf7',
    color: '#16151f',
    fontSize: 10,
    lineHeight: 1.45,
  },
  eyebrow: {
    color: '#6f6a7c',
    fontSize: 8,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  title: {
    fontSize: 30,
    lineHeight: 1,
    marginBottom: 10,
  },
  subtitle: {
    color: '#5a5668',
    fontSize: 10,
    marginBottom: 24,
  },
  section: {
    marginTop: 18,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#d8d4df',
  },
  heading: {
    fontSize: 14,
    marginBottom: 8,
  },
  paragraph: {
    marginBottom: 8,
    color: '#2d2a38',
  },
  grid: {
    display: 'flex',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  metric: {
    flexGrow: 1,
    padding: 10,
    borderWidth: 1,
    borderColor: '#d8d4df',
  },
  metricValue: {
    fontSize: 18,
    marginBottom: 3,
  },
  metricLabel: {
    color: '#6f6a7c',
    fontSize: 8,
    textTransform: 'uppercase',
  },
  tableRow: {
    display: 'flex',
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e7e2ee',
    paddingVertical: 6,
    gap: 6,
  },
  cellWide: {
    flexGrow: 1,
    flexBasis: 260,
  },
  cellSmall: {
    width: 70,
    color: '#5a5668',
  },
  mono: {
    fontSize: 8,
    color: '#5a5668',
  },
  chart: {
    width: '100%',
    height: 180,
    objectFit: 'contain',
    marginTop: 6,
  },
});

function dateRange(report: PostMortemReportRecord) {
  const start = new Date(report.windowStart).toISOString().slice(0, 10);
  const end = new Date(report.windowEnd).toISOString().slice(0, 10);
  return `${start} to ${end}`;
}

function replayPath(traceId: string | null) {
  return traceId ? `/dashboard/replay/${traceId}` : 'no replay';
}

function truncate(value: string, length = 180) {
  return value.length > length ? `${value.slice(0, length - 3)}...` : value;
}

function section(title: string, children: ReactNode) {
  return h(View, { style: styles.section }, h(Text, { style: styles.heading }, title), children);
}

function metric(label: string, value: string) {
  return h(
    View,
    { style: styles.metric },
    h(Text, { style: styles.metricValue }, value),
    h(Text, { style: styles.metricLabel }, label)
  );
}

function row(left: string, middle: string, right: string) {
  return h(
    View,
    { style: styles.tableRow },
    h(Text, { style: styles.cellWide }, truncate(left)),
    h(Text, { style: styles.cellSmall }, middle),
    h(Text, { style: styles.cellSmall }, right)
  );
}

function PostMortemDocument({
  report,
  chartDataUri,
}: {
  report: PostMortemReportRecord;
  chartDataUri: string | null;
}) {
  const payload = report.reportPayload;
  const usageTotal = payload.usage.reduce((sum, item) => sum + item.forecastCents, 0);

  return h(
    Document,
    null,
    h(
      Page,
      { size: 'A4', style: styles.page },
      h(Text, { style: styles.eyebrow }, 'SEIZN POST-MORTEM'),
      h(Text, { style: styles.title }, report.title),
      h(Text, { style: styles.subtitle }, dateRange(report)),
      h(
        View,
        { style: styles.grid },
        metric('Replays', payload.replayCount.toLocaleString()),
        metric('Canon hits', payload.canonViolations.length.toLocaleString()),
        metric('Chaos findings', payload.chaosFindings.length.toLocaleString()),
        metric('Overage forecast', `$${(usageTotal / 100).toFixed(2)}`)
      ),
      section(
        'Executive summary',
        report.executiveSummary.map((paragraph, index) =>
          h(Text, { key: `summary-${index}`, style: styles.paragraph }, paragraph)
        )
      ),
      section(
        'Top canon violations',
        report.reportPayload.canonViolations.length === 0
          ? h(Text, { style: styles.paragraph }, 'No canon violations found in the report window.')
          : report.reportPayload.canonViolations.map((item) =>
              row(item.attemptedContent, item.severity, replayPath(item.sessionId))
            )
      ),
      section(
        'Top chaos findings',
        report.reportPayload.chaosFindings.length === 0
          ? h(Text, { style: styles.paragraph }, 'No chaos findings found in the report window.')
          : report.reportPayload.chaosFindings.map((item) =>
              row(item.prompt, item.severity, item.category)
            )
      ),
      section(
        'Story Health trend',
        chartDataUri
          ? h(Image, { src: chartDataUri, style: styles.chart })
          : h(Text, { style: styles.paragraph }, 'No Story Health snapshots found in the report window.')
      ),
      section(
        'Overage billing summary',
        report.reportPayload.usage.length === 0
          ? h(Text, { style: styles.paragraph }, 'No metered overage usage found for the report window.')
          : report.reportPayload.usage.map((item) =>
              row(
                `${item.dimension} on ${item.plan}`,
                item.total.toLocaleString(),
                `$${(item.forecastCents / 100).toFixed(2)}`
              )
            )
      ),
      section(
        'Recommendations',
        report.recommendations.map((recommendation, index) =>
          h(Text, { key: `rec-${index}`, style: styles.paragraph }, `${index + 1}. ${recommendation}`)
        )
      ),
      h(Text, { style: [styles.section, styles.mono] }, `Report id: ${report.id}`)
    )
  );
}

export async function buildPostMortemPdf(report: PostMortemReportRecord): Promise<Buffer> {
  const chartDataUri = report.storyChartPngBase64
    ? `data:image/png;base64,${report.storyChartPngBase64}`
    : null;
  const document = PostMortemDocument({ report, chartDataUri }) as Parameters<typeof renderToBuffer>[0];
  return renderToBuffer(document);
}
