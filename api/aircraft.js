export default async function handler(req, res) {
    try {
        const apiKey = process.env.ADSBX_API_KEY;

        if (!apiKey) {
            return res.status(500).json({
                status: "ERROR",
                message: "ADSBX_API_KEY is missing"
            });
        }

        const lat = "50.1008";
        const lon = "14.2600";
        const dist = "10";

        const url =
            `https://adsbexchange-com1.p.rapidapi.com/v2/lat/${lat}/lon/${lon}/dist/${dist}/`;

        const response = await fetch(url, {
            method: "GET",
            headers: {
                "X-RapidAPI-Key": apiKey,
                "X-RapidAPI-Host": "adsbexchange-com1.p.rapidapi.com"
            }
        });

        const text = await response.text();

        if (!response.ok) {
            return res.status(response.status).json({
                status: "ERROR",
                upstreamStatus: response.status,
                upstreamText: text
            });
        }

        let data;

        try {
            data = JSON.parse(text);
        } catch {
            return res.status(500).json({
                status: "ERROR",
                message: "Could not parse ADS-B Exchange response",
                upstreamText: text
            });
        }

        res.setHeader("Cache-Control", "no-store");

        return res.status(200).json(data);

    } catch (error) {
        return res.status(500).json({
            status: "ERROR",
            message: error.message
        });
    }
}
