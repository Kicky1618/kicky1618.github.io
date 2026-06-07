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

function formatDateLabel(date: string) {
    const parsed = new Date(`${date}T00:00:00`);

    return new Intl.DateTimeFormat("ja-JP", {
        month: "numeric",
        day: "numeric",
    }).format(parsed);
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

function setText(selector: string, text: string) {
    const element = document.querySelector<HTMLElement>(selector);

    if (!element) {
        throw new Error(`${selector} is missing`);
    }

    element.textContent = text;
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
    const sortedUsage = [...usage].sort((a, b) => a.date.localeCompare(b.date));
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
    fetch("https://kicky_api.jet9.app/")
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
}

document.addEventListener("DOMContentLoaded", init)
