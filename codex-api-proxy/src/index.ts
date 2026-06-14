import http from "node:http"
import { config } from "dotenv"
config()

let response_cache = "";
let response_cache_time: number | null = null;
let response2_cache = "";
let response2_cache_time: number | null = null;

const server = http.createServer(async (req, res) => {
    try {
        if (req.url === "/usage/") {
            const cached = response_cache_time !== null && (Date.now() - response_cache_time < 60 * 1000 * 10)
            if (cached) {
                res.writeHead(200, "OK", {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
                    "Access-Control-Allow-Headers": "*",
                })
                res.write(response_cache)
                res.end()
                return
            }
            const request = await fetch("https://chatgpt.com/backend-api/wham/analytics/daily-workspace-usage-counts", {
                "headers": {
                    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
                    "accept-language": "ja,en;q=0.9,en-GB;q=0.8,en-US;q=0.7",
                    "cache-control": "max-age=0",
                    "priority": "u=0, i",
                    "sec-ch-ua": "\"Chromium\";v=\"148\", \"Microsoft Edge\";v=\"148\", \"Not/A)Brand\";v=\"99\"",
                    "sec-ch-ua-mobile": "?0",
                    "sec-ch-ua-platform": "\"Linux\"",
                    "sec-fetch-dest": "document",
                    "sec-fetch-mode": "navigate",
                    "sec-fetch-site": "none",
                    "sec-fetch-user": "?1",
                    "upgrade-insecure-requests": "1",
                    "authorization": `Bearer ${process.env.CODEX_ACCESS_KEY}`
                },
                "method": "GET"
            });
            const response = await request.text()
            response_cache = response
            response_cache_time = Date.now()
            res.writeHead(200, "OK", {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
                "Access-Control-Allow-Headers": "*",
            })
            res.write(response)
            res.end()
        } else if (req.url === "/limit/") {
            const cached = response2_cache_time !== null && (Date.now() - response2_cache_time < 60 * 1000 * 10)
            if (cached) {
                res.writeHead(200, "OK", {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
                    "Access-Control-Allow-Headers": "*",
                })
                res.write(response2_cache)
                res.end()
                return
            }
            const request = await fetch("https://chatgpt.com/backend-api/wham/usage", {
                "headers": {
                    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
                    "accept-language": "ja,en;q=0.9,en-GB;q=0.8,en-US;q=0.7",
                    "cache-control": "max-age=0",
                    "priority": "u=0, i",
                    "sec-ch-ua": "\"Chromium\";v=\"148\", \"Microsoft Edge\";v=\"148\", \"Not/A)Brand\";v=\"99\"",
                    "sec-ch-ua-mobile": "?0",
                    "sec-ch-ua-platform": "\"Linux\"",
                    "sec-fetch-dest": "document",
                    "sec-fetch-mode": "navigate",
                    "sec-fetch-site": "none",
                    "sec-fetch-user": "?1",
                    "upgrade-insecure-requests": "1",
                    "authorization": `Bearer ${process.env.CODEX_ACCESS_KEY}`
                },
                "method": "GET"
            });
            const response = JSON.stringify((await request.json() as any).rate_limit)
            response2_cache = response
            response2_cache_time = Date.now()
            res.writeHead(200, "OK", {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
                "Access-Control-Allow-Headers": "*",
            })
            res.write(response)
            res.end()
        } else {
            res.writeHead(404, "Not Found", {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
                "Access-Control-Allow-Headers": "*",
            })
            res.write("404")
            res.end()
        }
    } catch (e) {
        try {
            console.log(e)
            res.writeHead(500, "Internal Server Error", {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
                "Access-Control-Allow-Headers": "*",
            })
            res.write("503")
            res.end()
        } catch (e) { }
    }
})

server.listen(30012)
