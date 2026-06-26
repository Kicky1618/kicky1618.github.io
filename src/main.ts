import "./style.css"
import "@tabler/icons-webfont/dist/tabler-icons.min.css";
import {
    BarController,
    BarElement,
    CategoryScale,
    Chart,
    LinearScale,
    Tooltip,
    type ChartConfiguration,
} from "chart.js";

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);

const CREDIT_USD_RATE = 0.04;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

type TokenMetrics = {
    users: number;
    threads: number;
    turns: number;
    credits: number;
    uncached_text_input_tokens: number;
    cached_text_input_tokens: number;
    text_output_tokens: number;
    text_total_tokens: number;
};

type ClientUsage = TokenMetrics & {
    client_id: string;
};

type ModelUsage = {
    model: string;
    credits: number;
    users: number;
    threads: number;
    turns: number;
};

type DailyUsage = {
    date: string; // YYYY-MM-DD
    totals: TokenMetrics;
    clients: ClientUsage[];
    models: ModelUsage[];
};

export type UsageResponse = {
    data: DailyUsage[];
    group_by: "day";
};

let codex_usage: DailyUsage[] | null = null

let usageChart: Chart<"bar", number[], string> | null = null;

type RateLimitStatus = {
    allowed: boolean;
    limit_reached: boolean;
    primary_window: RateLimitWindow;
    secondary_window: RateLimitWindow;
};

type RateLimitWindow = {
    used_percent: number;
    limit_window_seconds: number;
    reset_after_seconds: number;
    reset_at: number;
};

function getUsageChartElements() {
    const canvas = document.querySelector<HTMLCanvasElement>("#usage-chart");
    const chartWrap = document.querySelector<HTMLDivElement>("#usage-chart-wrap");
    const status = document.querySelector<HTMLDivElement>("#usage-status");
    const summary = document.querySelector<HTMLDListElement>("#usage-summary");

    if (!canvas || !chartWrap || !status || !summary) {
        throw new Error("usage chart elements are missing");
    }

    return { canvas, chartWrap, status, summary };
}

function getRateLimitElements() {
    const summary = document.querySelector<HTMLDivElement>("#rate-limit-summary");

    if (!summary) {
        throw new Error("rate limit elements are missing");
    }

    return { summary };
}

function formatDateLabel(date: string) {
    const parsed = new Date(`${date}T00:00:00`);

    return new Intl.DateTimeFormat("ja-JP", {
        month: "numeric",
        day: "numeric",
    }).format(parsed);
}

function createEmptyTokenMetrics(): TokenMetrics {
    return {
        users: 0,
        threads: 0,
        turns: 0,
        credits: 0,
        uncached_text_input_tokens: 0,
        cached_text_input_tokens: 0,
        text_output_tokens: 0,
        text_total_tokens: 0,
    };
}

function parseDateKey(date: string) {
    const [year, month, day] = date.split("-").map(Number);

    if (!year || !month || !day) {
        return null;
    }

    const time = Date.UTC(year, month - 1, day);

    return Number.isNaN(time) ? null : time;
}

function formatDateKey(time: number) {
    return new Date(time).toISOString().slice(0, 10);
}

function createEmptyDailyUsage(date: string): DailyUsage {
    return {
        date,
        totals: createEmptyTokenMetrics(),
        clients: [],
        models: [],
    };
}

function fillMissingUsageDates(usage: DailyUsage[]) {
    const usageByDate = new Map(usage.map((day) => [day.date, day]));
    const dateTimes = usage
        .map((day) => parseDateKey(day.date))
        .filter((time): time is number => time !== null)
        .sort((a, b) => a - b);

    const firstDate = dateTimes[0];
    const lastDate = dateTimes.at(-1);

    if (firstDate === undefined || lastDate === undefined) {
        return [...usage].sort((a, b) => a.date.localeCompare(b.date));
    }

    const filledUsage: DailyUsage[] = [];

    for (let time = firstDate; time <= lastDate; time += ONE_DAY_MS) {
        const date = formatDateKey(time);
        filledUsage.push(usageByDate.get(date) ?? createEmptyDailyUsage(date));
    }

    return filledUsage;
}

function formatNumber(value: number, digits = 0) {
    return new Intl.NumberFormat("ja-JP", {
        maximumFractionDigits: digits,
    }).format(value);
}

function formatUsd(value: number) {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
    }).format(value);
}

function formatPercent(value: number) {
    return `${formatNumber(value, 1)}%`;
}

function formatDuration(seconds: number) {
    const safeSeconds = Math.max(0, Math.round(seconds));
    const days = Math.floor(safeSeconds / 86400);
    const hours = Math.floor((safeSeconds % 86400) / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);

    if (days > 0) {
        return `${days}日${hours}時間`;
    }

    if (hours > 0) {
        return `${hours}時間${minutes}分`;
    }

    return `${minutes}分`;
}

function formatResetTime(resetAt: number) {
    const resetAtMs = resetAt > 1_000_000_000_000 ? resetAt : resetAt * 1000;
    const date = new Date(resetAtMs);

    if (Number.isNaN(date.getTime())) {
        return "-";
    }

    return new Intl.DateTimeFormat("ja-JP", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    }).format(date);
}

function setText(selector: string, text: string) {
    const element = document.querySelector<HTMLElement>(selector);

    if (!element) {
        throw new Error(`${selector} is missing`);
    }

    element.textContent = text;
}

function setRateLimitWindow(prefix: "primary" | "secondary", window: RateLimitWindow) {
    const usedPercent = Math.min(Math.max(window.used_percent, 0), 100);
    const remainingPercent = 100 - usedPercent;
    const circle = document.querySelector<HTMLDivElement>(`#rate-limit-${prefix}-circle`);

    if (!circle) {
        throw new Error(`#rate-limit-${prefix}-circle is missing`);
    }

    setText(`#rate-limit-${prefix}-percent`, `${formatPercent(remainingPercent)} 残り`);
    setText(`#rate-limit-${prefix}-window`, formatDuration(window.limit_window_seconds));
    setText(
        `#rate-limit-${prefix}-reset`,
        `${formatDuration(window.reset_after_seconds)}後 (${formatResetTime(window.reset_at)})`,
    );

    circle.style.setProperty("--remaining-percent", `${remainingPercent}%`);
    circle.dataset.level = remainingPercent <= 10 ? "danger" : remainingPercent <= 30 ? "warning" : "normal";
    circle.setAttribute("aria-valuenow", formatNumber(remainingPercent, 1));
}

function renderRateLimitStatus(rateLimit: RateLimitStatus) {
    const { summary } = getRateLimitElements();

    setRateLimitWindow("primary", rateLimit.primary_window);
    setRateLimitWindow("secondary", rateLimit.secondary_window);
    summary.hidden = false;
}

function renderUsageSummary(usage: DailyUsage[]) {
    const { summary } = getUsageChartElements();
    const dayCount = usage.length || 1;
    const totalCredits = usage.reduce((sum, day) => sum + day.totals.credits, 0);
    const totalTokens = usage.reduce((sum, day) => sum + day.totals.text_total_tokens, 0);
    const totalCost = totalCredits * CREDIT_USD_RATE;

    setText("#usage-total-tokens", formatNumber(totalTokens));
    setText("#usage-daily-tokens", formatNumber(totalTokens / dayCount));
    setText("#usage-total-credits", formatNumber(totalCredits, 2));
    setText("#usage-daily-credits", formatNumber(totalCredits / dayCount, 2));
    setText("#usage-total-cost", formatUsd(totalCost));
    setText("#usage-daily-cost", formatUsd(totalCost / dayCount));

    summary.hidden = false;
}

function renderUsageChart(usage: DailyUsage[]) {
    const { canvas, chartWrap, status } = getUsageChartElements();
    const sortedUsage = fillMissingUsageDates(usage);
    const labels = sortedUsage.map((day) => formatDateLabel(day.date));
    const credits = sortedUsage.map((day) => day.totals.credits);

    if (usageChart) {
        usageChart.destroy();
    }

    const config: ChartConfiguration<"bar", number[], string> = {
        type: "bar",
        data: {
            labels,
            datasets: [
                {
                    label: "Credits",
                    data: credits,
                    backgroundColor: "rgba(92, 200, 190, 0.78)",
                    borderColor: "rgb(124, 231, 220)",
                    borderWidth: 1,
                    borderRadius: 5,
                    maxBarThickness: 34,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 450,
            },
            plugins: {
                legend: {
                    display: false,
                },
                tooltip: {
                    callbacks: {
                        title: (items) => sortedUsage[items[0]?.dataIndex ?? 0]?.date ?? "",
                        label: (item) => {
                            const day = sortedUsage[item.dataIndex];
                            const credits = item.parsed.y ?? 0;
                            const cost = credits * CREDIT_USD_RATE;

                            return [
                                `Credits: ${formatNumber(credits, 2)}`,
                                `Tokens: ${formatNumber(day?.totals.text_total_tokens ?? 0)}`,
                                `Cost: ${formatUsd(cost)}`,
                            ];
                        },
                    },
                },
            },
            scales: {
                x: {
                    grid: {
                        color: "rgba(255, 255, 255, 0.08)",
                    },
                    ticks: {
                        color: "rgb(218, 218, 218)",
                    },
                },
                y: {
                    beginAtZero: true,
                    grid: {
                        color: "rgba(255, 255, 255, 0.10)",
                    },
                    ticks: {
                        color: "rgb(218, 218, 218)",
                    },
                },
            },
        },
    };

    usageChart = new Chart(canvas, config);
    status.textContent = `${sortedUsage.length.toLocaleString("ja-JP")}日分のCodex使用量`;
    chartWrap.hidden = false;
    renderUsageSummary(sortedUsage);
}

function init() {
    fetch("https://kicky_api.jet9.app/usage/")
        .then((response) => {
            if (!response.ok) {
                throw new Error(`Codex usage request failed: ${response.status}`);
            }

            return response.json();
        })
        .then((v: UsageResponse) => {
            codex_usage = v.data
            renderUsageChart(codex_usage)
        })
        .catch((error) => {
            console.error(error);
            const { status } = getUsageChartElements();
            status.textContent = "Codex usageを読み込めませんでした。プロキシが起動しているか確認してください。";
        })
    fetch("https://kicky_api.jet9.app/limit/")
        .then((response) => {
            if (!response.ok) {
                throw new Error(`Codex rate limit request failed: ${response.status}`);
            }

            return response.json();
        })
        .then((rateLimit: RateLimitStatus) => {
            renderRateLimitStatus(rateLimit);
        })
        .catch((error) => {
            console.error(error);
        })
}

document.addEventListener("DOMContentLoaded", init)
