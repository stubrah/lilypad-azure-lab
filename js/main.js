const residentForm = document.querySelector("#resident-application");

if (residentForm) {
  const status = document.querySelector("#resident-form-status");
  const submitButton = residentForm.querySelector("button[type='submit']");

  residentForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    status.className = "form-status";
    status.textContent = "Submitting fake application…";
    submitButton.disabled = true;

    const formData = new FormData(residentForm);
    const payload = {
      fullName: formData.get("name")?.trim(),
      email: formData.get("email")?.trim(),
      phone: formData.get("phone")?.trim() || null,
      situation: formData.get("situation")?.trim() || null,
      timeline: formData.get("timeline") || null,
    };

    try {
      const apiBaseUrl = (window.LILYPAD_API_BASE_URL || "").replace(/\/$/, "");
      const response = await fetch(`${apiBaseUrl}/api/resident-applications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "The application could not be saved.");
      }

      status.classList.add("success");
      status.textContent = `Saved fake application ${result.applicationId}.`;
      residentForm.reset();
    } catch (error) {
      status.classList.add("error");
      status.textContent = error.message;
    } finally {
      submitButton.disabled = false;
    }
  });
}
