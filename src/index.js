// List of allowed Roblox subdomains
const domains = [
    "apis",
    "assetdelivery",
    "avatar",
    "badges",
    "catalog",
    "chat",
    "contacts",
    "contentstore",
    "develop",
    "economy",
    "economycreatorstats",
    "followings",
    "friends",
    "games",
    "groups",
    "groupsmoderation",
    "inventory",
    "itemconfiguration",
    "locale",
    "notifications",
    "points",
    "presence",
    "privatemessages",
    "publish",
    "search",
    "thumbnails",
    "trades",
    "translations",
    "users",
];

module.exports.handler = async (event) => {
    try {
        // 1. Get the path parameters safely
        const rawPath =
            event.rawPath ||
            event.requestContext?.http?.path ||
            event.path ||
            "";

        // Split the path into segments and remove empty items
        let pathSegments = rawPath.split("/").filter(Boolean);

        // FIX: If the first segment is "RobloxProxy" or "Prod", remove it so we can find the real subdomain
        if (pathSegments[0] === "Prod") {
            pathSegments.shift();
        }
        if (pathSegments[0] === "RobloxProxy") {
            pathSegments.shift();
        }

        if (pathSegments.length === 0) {
            return {
                statusCode: 400,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: "Missing ROBLOX subdomain." }),
            };
        }

        // Now pathSegments[0] is safely "catalog", "users", etc.
        console.log(pathSegments);
        const subdomain = pathSegments[0].toLowerCase();
        if (!domains.includes(subdomain)) {
            return {
                statusCode: 401,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: `Specified subdomain '${subdomain}' is not allowed.`,
                }),
            };
        }

        // 2. Reconstruct the target Roblox URL
        const robloxPath = pathSegments.slice(1).join("/");
        const queryString = event.rawQueryString
            ? `?${event.rawQueryString}`
            : "";
        const targetUrl = `https://${subdomain}://{robloxPath}${queryString}`;

        console.log(targetUrl);

        // 3. Clean up and forward headers safely
        const incomingHeaders = event.headers || {};
        const forwardedHeaders = {};

        for (const [key, value] of Object.entries(incomingHeaders)) {
            const lowerKey = key.toLowerCase();
            if (
                lowerKey !== "host" &&
                lowerKey !== "roblox-id" &&
                lowerKey !== "user-agent" &&
                !lowerKey.startsWith("x-forwarded-")
            ) {
                forwardedHeaders[key] = value;
            }
        }

        // Spoof user-agent to look like a desktop browser
        forwardedHeaders["user-agent"] =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36";

        // 4. Construct fetch options
        const httpMethod =
            event.requestContext?.http?.method || event.httpMethod || "GET";
        const fetchOptions = {
            method: httpMethod,
            headers: forwardedHeaders,
        };

        if (httpMethod !== "GET" && httpMethod !== "HEAD" && event.body) {
            fetchOptions.body = event.isBase64Encoded
                ? Buffer.from(event.body, "base64").toString("utf8")
                : event.body;
        }

        // 5. Send request to Roblox using native global fetch
        const robloxResponse = await fetch(targetUrl, fetchOptions);
        const responseText = await robloxResponse.text();

        // 6. Return response formatted for API Gateway 2.0
        return {
            statusCode: robloxResponse.status,
            headers: {
                "Content-Type":
                    robloxResponse.headers.get("content-type") ||
                    "application/json",
            },
            body: responseText,
        };
    } catch (error) {
        console.error("CRITICAL PROXY ERROR:", error);
        return {
            statusCode: 500,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                message: "Internal proxy error",
                error: error.message,
            }),
        };
    }
};
