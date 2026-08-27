export default async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(503).json({
        status: "DISABLED_FOR_LOCAL_TEST",
        message: "ADS-B Exchange temporarily disabled while testing Raspberry Pi receiver"
    });
}
