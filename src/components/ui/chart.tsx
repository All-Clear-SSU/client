"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import * as React from "react";
import * as RechartsPrimitive from "recharts";
import { cn } from "./utils";

/** 테마별 CSS 변수 주입 */
const THEMES = { light: "", dark: ".dark" } as const;

export type ChartConfig = {
  [k in string]: {
    label?: React.ReactNode;
    icon?: React.ComponentType;
  } & (
    | { color?: string; theme?: never }
    | { color?: never; theme: Record<keyof typeof THEMES, string> }
  );
};

type ChartContextProps = { config: ChartConfig };
const ChartContext = React.createContext<ChartContextProps | null>(null);

function useChart() {
  const ctx = React.useContext(ChartContext);
  if (!ctx) throw new Error("useChart must be used within a <ChartContainer />");
  return ctx;
}

function ChartContainer({
  id,
  className,
  children,
  config,
  ...props
}: React.ComponentProps<"div"> & {
  config: ChartConfig;
  children: React.ComponentProps<
    typeof RechartsPrimitive.ResponsiveContainer
  >["children"];
}) {
  const uniqueId = React.useId();
  const chartId = `chart-${id || uniqueId.replace(/:/g, "")}`;

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-slot="chart"
        data-chart={chartId}
        className={cn(
          "flex aspect-video justify-center text-xs",
          // 일부 Recharts 기본 스타일 정리
          "[&_.recharts-dot[stroke='#fff']]:stroke-transparent [&_.recharts-layer]:outline-hidden [&_.recharts-sector]:outline-hidden [&_.recharts-sector[stroke='#fff']]:stroke-transparent",
          className
        )}
        {...props}
      >
        <ChartStyle id={chartId} config={config} />
        <RechartsPrimitive.ResponsiveContainer>
          {children}
        </RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
}

/** CSS 변수 주입 */
const ChartStyle = ({ id, config }: { id: string; config: ChartConfig }) => {
  const colorConfig = Object.entries(config).filter(
    ([, c]) => c.theme || c.color
  );
  if (!colorConfig.length) return null;

  return (
    <style
      dangerouslySetInnerHTML={{
        __html: Object.entries(THEMES)
          .map(
            ([theme, prefix]) => `
${prefix} [data-chart=${id}] {
${colorConfig
  .map(([key, item]) => {
    const color =
      item.theme?.[theme as keyof typeof item.theme] || item.color;
    return color ? `  --color-${key}: ${color};` : null;
  })
  .filter(Boolean)
  .join("\n")}
}
`
          )
          .join("\n"),
      }}
    />
  );
};

/* =========================================================
 * Tooltip / Legend용 안전한 사용자 정의 타입들
 * =======================================================*/
type TooltipItem = {
  value?: number | string;
  name?: string;
  color?: string;
  dataKey?: string;
  payload?: Record<string, unknown>;
};

interface ChartTooltipContentProps {
  /** Recharts가 content 컴포넌트에 주는 활성화 여부 */
  active?: boolean;
  /** 데이터 포인트들 */
  payload?: TooltipItem[];
  /** X축 라벨 등 */
  label?: string | number;
  /** 외부에서 넘겨줄 클래스 */
  className?: string;

  /** 옵션들 */
  indicator?: "line" | "dot" | "dashed";
  hideLabel?: boolean;
  hideIndicator?: boolean;
  labelFormatter?: (value: unknown, payload?: TooltipItem[]) => React.ReactNode;
  formatter?: (
    value: unknown,
    name: unknown,
    item: TooltipItem,
    index: number,
    raw?: unknown
  ) => React.ReactNode;
  color?: string;
  nameKey?: string;
  labelKey?: string;
  labelClassName?: string;
}

const ChartTooltip = RechartsPrimitive.Tooltip;

/** 사용자 정의 Tooltip Content */
function ChartTooltipContent({
  active,
  payload = [],
  className,
  indicator = "dot",
  hideLabel = false,
  hideIndicator = false,
  label,
  labelFormatter,
  labelClassName,
  //formatter,
  color,
  nameKey,
  labelKey,
}: ChartTooltipContentProps) {
  const { config } = useChart();

  const tooltipLabel = React.useMemo(() => {
    if (hideLabel || !payload.length) return null;
    const item = payload[0];
    const key = `${labelKey || item?.dataKey || item?.name || "value"}`;
    const itemConfig = getPayloadConfigFromPayload(config, item, key);

    const resolved =
      !labelKey && typeof label === "string"
        ? config[label as keyof typeof config]?.label || label
        : itemConfig?.label;

    if (labelFormatter) {
      return (
        <div className={cn("font-medium", labelClassName)}>
          {labelFormatter(resolved, payload)}
        </div>
      );
    }
    if (!resolved) return null;
    return <div className={cn("font-medium", labelClassName)}>{resolved}</div>;
  }, [hideLabel, payload, labelKey, config, label, labelFormatter, labelClassName]);

  if (!active || !payload.length) return null;

  const nestLabel = payload.length === 1 && indicator !== "dot";

  return (
    <div
      className={cn(
        "border-border/50 bg-background grid min-w-32 items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs shadow-xl",
        className
      )}
    >
      {!nestLabel ? tooltipLabel : null}
      <div className="grid gap-1.5">
        {payload.map((item, index) => {
          const key = `${nameKey || item.name || item.dataKey || "value"}`;
          const itemConfig = getPayloadConfigFromPayload(config, item, key);
          const indicatorColor =
            color || (item?.payload as any)?.fill || item?.color;

          return (
            <div
              key={(item.dataKey ?? item.name ?? index)?.toString()}
              className={cn(
                "flex w-full flex-wrap items-stretch gap-2",
                indicator === "dot" && "items-center"
              )}
            >
              {/* 인디케이터 */}
              {!hideIndicator && (
                <div
                  className={cn(
                    "shrink-0 rounded-sm",
                    indicator === "dot" && "h-2.5 w-2.5",
                    indicator === "line" && "w-1 h-2.5",
                    indicator === "dashed" &&
                      "w-0 border-[1.5px] border-dashed bg-transparent"
                  )}
                  style={
                    {
                      backgroundColor: indicatorColor,
                      borderColor: indicatorColor,
                    } as React.CSSProperties
                  }
                />
              )}

              {/* 라벨 + 값 */}
              <div className="flex flex-1 justify-between">
                <div className="grid gap-1.5">
                  {nestLabel ? tooltipLabel : null}
                  <span className="text-muted-foreground">
                    {itemConfig?.label || item?.name}
                  </span>
                </div>
                {item?.value !== undefined && item?.value !== null && (
                  <span className="text-foreground font-mono font-medium tabular-nums">
                    {typeof item.value === "number"
                      ? item.value.toLocaleString()
                      : String(item.value)}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- Legend ---------------- */

type LegendItem = {
  value?: string;
  color?: string;
  dataKey?: string;
};

/** Legend content에 필요한 프로퍼티만 정의 (div props와 분리) */
interface ChartLegendContentProps {
  className?: string;
  hideIcon?: boolean;
  payload?: LegendItem[];
  verticalAlign?: "top" | "bottom" | "middle";
  nameKey?: string;
}

const ChartLegend = RechartsPrimitive.Legend;

/** 사용자 정의 Legend Content */
function ChartLegendContent({
  className,
  hideIcon = false,
  payload = [],
  verticalAlign = "bottom",
  nameKey,
}: ChartLegendContentProps) {
  const { config } = useChart();
  if (!payload.length) return null;

  return (
    <div
      className={cn(
        "flex items-center justify-center gap-4",
        verticalAlign === "top" ? "pb-3" : "pt-3",
        className
      )}
    >
      {payload.map((item, index) => {
        const key = `${nameKey || item?.dataKey || "value"}`;
        const itemConfig = getPayloadConfigFromPayload(config, item as any, key);

        return (
          <div
            key={(item.value ?? index)?.toString()}
            className="flex items-center gap-1.5 [&>svg]:h-3 [&>svg]:w-3"
          >
            {!hideIcon ? (
              <div
                className="h-2 w-2 shrink-0 rounded-sm"
                style={{ backgroundColor: item?.color }}
              />
            ) : null}
            {itemConfig?.label ?? item?.value}
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- 공통 헬퍼 ---------------- */

function getPayloadConfigFromPayload(
  config: ChartConfig,
  payload: Record<string, unknown> | undefined,
  key: string
) {
  if (!payload || typeof payload !== "object") return undefined;

  const nested =
    typeof (payload as any).payload === "object" ? (payload as any).payload : {};

  const labelKey =
    typeof (payload as any)[key] === "string"
      ? ((payload as any)[key] as string)
      : typeof nested[key] === "string"
      ? (nested[key] as string)
      : key;

  return (config as any)[labelKey] ?? (config as any)[key];
}

export {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  ChartStyle,
};
