angular
  .module("pdfApp", ["ngMaterial", "ngMessages"])
  .config(function ($mdThemingProvider) {
    $mdThemingProvider.theme("default").dark();
  })
  .service("PdfService", function () {
    this.loadPdf = function (url) {
      return pdfjsLib.getDocument(url).promise;
    };
  })
  .controller(
    "PdfController",
    function (
      $scope,
      PdfService, // Inject the PdfService service
      $timeout, // Inject the $timeout service for debouncing search input
      $document, // Inject the $document service for DOM manipulation
      $mdSidenav, // Inject the $mdSidenav service for handling sidenav
      $element, // Inject the $element service for DOM manipulation
      $http, // Inject the $http service for loading the configuration file
      $mdToast, //Inject the $mdToast service for showing error messages
      $mdSelect, // Inject the $mdSelect service for handling dropdowns
      $mdMenu // Inject the $mdMenu service
    ) {
      // Set the workerSrc to the local path of pdf.worker.min.js
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        "./pdfjs-2.16.105/pdf.worker.min.js";

      $scope.currentPage = 1; // Current page number
      $scope.totalPages = 0; // Total number of pages in the PDF
      $scope.zoomLevel = 1.0; // Default zoom level
      $scope.defaultZoomLevel = 1.0; // Store the default zoom level (100%)
      $scope.gotoPageNumber = null; // Page number input field
      $scope.searchText = ""; // Search text
      $scope.searchResults = []; // Search results
      $scope.currentSearchResultIndex = -1; // Index of the current search result
      $scope.displayMode = "all"; // Default display mode: 'all' or 'single'
      $scope.pageOffset = 0; // Page number offset
      let pdfDoc = null; // PDF document object
      let pageCache = {}; // Cache for rendered pages
      let pageObjectCache = {}; // Cache for PDF page objects
      $scope.showSearchControls = false;
      $scope.isSearch = false; // Search in progress
      $scope.isLoading = false; // Spinner visibility
      $scope.isMaximized = false; // Full-screen mode
      $scope.documentOutline = []; // Document outline for sidebar navigation
      $scope.allOutlinesExpanded = false; // Expand all document outlines
      $scope.canvasIsRendering = false; // Flag to check if canvas is rendering
      $scope.prevPageWidthSize = 1; // Store the previous page width size
      $scope.isSetPageWidth = false; // Flag to check if page width is set

      // Variable to hold the observers
      let pageObservers = [];

      // Load configuration file to load PDF document
      $http
        .get("./config.json")
        .then(function (response) {
          const config = response.data;
          $scope.pdfFileName = config.pdfFileName;
          $scope.pageOffset = config.pageOffset;

          // Load PDF document when the document is ready
          $document.ready(function () {
            PdfService.loadPdf(`./${$scope.pdfFileName}`)
              .then(function (pdf) {
                pdfDoc = pdf;

                // Get the document outline for sidebar navigation
                pdf
                  .getOutline()
                  .then(function (outline) {
                    $scope.documentOutline = outline;
                    $scope.$applyAsync(); // Ensure the view is updated
                  })
                  .catch(handleError);

                $scope.totalPages = pdf.numPages;
                //$scope.setPageWidth(); // Set the page width initially
                $scope.setPageFit(); // Set the page fit initially
                $scope.$applyAsync(); // Ensure the view is updated
                // No need to render the page here; it will be rendered on demand
              })
              .catch(handleError);

            // Add event listener for arrow keys to navigate pages
            document.addEventListener("keydown", handleKeyNavigation);
          });
        })
        .catch(handleError);

      $scope.zoomInToPreset = function (pageNumber) {                          
        $scope.setZoom(300);
        $scope.currentPage = pageNumber;        
        console.log("current page number", $scope.currentPage, "page number", pageNumber, "gotoPageNumber", $scope.gotoPageNumber);
        const pageContainer = document.getElementById(
          `page-container-${$scope.currentPage}`
        );
        if (pageContainer) {
          pageContainer.scrollIntoView({ behavior: "smooth" });
          highlightPageContainer(pageContainer, 1000);
        }
        console.log("current page number", $scope.currentPage, "page number", pageNumber, "gotoPageNumber", $scope.gotoPageNumber);
      };

      // Function to toggle the locked open state of the sidenav
      $scope.toggleLockedOpen = function () {
        $scope.isLockedOpen = !$scope.isLockedOpen;
      };

      // Function to toggle all outlines
      $scope.toggleAllOutlines = function () {
        $scope.allOutlinesExpanded = !$scope.allOutlinesExpanded;

        // Recursive function to toggle outline items
        function toggleOutlineItems(items, expanded) {
          items.forEach((item) => {
            item.expanded = expanded;
            if (item.items && item.items.length > 0) {
              toggleOutlineItems(item.items, expanded);
            }
          });
        }

        toggleOutlineItems($scope.documentOutline, $scope.allOutlinesExpanded);
      };

      // Function to open the menu
      $scope.openMenu = function ($mdMenu, ev) {
        $mdMenu.open(ev);
      };

      // Function to show a toast message
      $scope.showToast = function (message) {
        $mdToast.show(
          $mdToast
            .simple()
            .textContent(message)
            .position("top right")
            .hideDelay(3000)
            .toastClass("custom-toast")
        );
      };

      // Function to handle key navigation
      function handleKeyNavigation(event) {
        switch (event.key) {
          case "ArrowRight":
            $scope.$apply(function () {
              $scope.nextPage();
            });
            break;
          case "ArrowLeft":
            $scope.$apply(function () {
              $scope.prevPage();
            });
            break;
          case "PageDown":
            $scope.$apply(function () {
              $scope.nextPage();
            });
            break;
          case "PageUp":
            $scope.$apply(function () {
              $scope.prevPage();
            });
            break;
          case "ArrowDown":
            $scope.$apply(function () {
              if ($scope.showSearchControls) {
                $scope.nextSearchResult();
              } else {
                $scope.nextPage();
              }
            });
            break;
          case "ArrowUp":
            $scope.$apply(function () {
              if ($scope.showSearchControls) {
                $scope.prevSearchResult();
              } else {
                $scope.prevPage();
              }
            });
            break;
          case "Home":
            $scope.$apply(function () {
              $scope.firstPage();
            });
            break;
          case "End":
            $scope.$apply(function () {
              $scope.lastPage();
            });
            break;
        }
      }

      // Remove the event listener when the controller is destroyed
      $scope.$on("$destroy", function () {
        document.removeEventListener("keydown", handleKeyNavigation);
      });

      $scope.getRoundedZoom = function () {
        return Math.round($scope.zoomLevel * 100);
      };
      // Initialize presetZoom with the value returned by getRoundedZoom
      $scope.presetZoom = $scope.getRoundedZoom();
      $scope.zoomOptions = [
        50, 75, 100, 125, 150, 175, 200, 250, 300, 400, 500, 800,
      ];
      $scope.isSidenavOpen = function () {
        return $mdSidenav("left").isOpen();
      };

      $scope.toggleSidenav = function () {
        $mdSidenav("left")
          .toggle()
          .then(function () {
            console.log("Sidenav is open:", $scope.isSidenavOpen());
          });
      };

      // Function to toggle the visibility of the search controls
      $scope.toggleSearchControls = function () {
        if ($scope.showSearchControls) {
          //$scope.clearSearch();
        } else {
          // Focus the search input after showing the search controls
          $timeout(function () {
            var searchInput = $document[0].querySelector(
              'input[ng-model="searchText"]'
            );
            if (searchInput) {
              searchInput.focus();
            }
          }, 0);
        }
        $scope.showSearchControls = !$scope.showSearchControls;
      };

      

      // Download PDF function
      $scope.downloadPdf = function () {
        const link = document.createElement("a");
        link.href = `./${$scope.pdfFileName}`;
        link.download = $scope.pdfFileName;
        link.click();
      };

      // Print PDF function
      $scope.printDocument = function () {
        if (!pdfDoc) {
          console.error("PDF document is not loaded");
          return;
        }

        // Open the PDF in a new tab and invoke the browser's print dialog
        const pdfUrl = `./${$scope.pdfFileName}`;
        const printWindow = window.open(pdfUrl, "_blank");
        printWindow.addEventListener("load", function () {
          printWindow.print();
        });
      };

      // Function to capture scroll position
      function getScrollPosition() {
        const scrollContainer = document.documentElement || document.body;
        const scrollTop = scrollContainer.scrollTop;

        const pageContainers = document.querySelectorAll(
          '[id^="page-container-"]'
        );
        for (let i = 0; i < pageContainers.length; i++) {
          const pageContainer = pageContainers[i];
          const pageRect = pageContainer.getBoundingClientRect();
          const pageTop = pageRect.top + scrollTop;
          const pageBottom = pageRect.bottom + scrollTop;

          if (pageBottom > scrollTop) {
            const pageNumber = parseInt(
              pageContainer.id.replace("page-container-", "")
            );
            const offsetWithinPage = scrollTop - pageTop;
            return { pageNumber, offsetWithinPage };
          }
        }
        return null;
      }

      // Function to open the zoom dropdown
      $scope.openZoomDropdown = function () {
        const dropdownElement = $element.find("md-select")[0];
        if (dropdownElement) {
          dropdownElement.click();
        }
      };

      $scope.setZoom = function (value) {
        if (value >= 10 && value <= 800) {
          // Capture the current scroll position
          const scrollPosition = getScrollPosition();
      
          $scope.zoomLevel = value / 100; // Assuming zoomLevel is a fraction (e.g., 1 for 100%)
          $scope.presetZoom = value; // Update the preset zoom value
          pageCache = {}; // Clear the cache
          // Disconnect existing observers and clear page containers
          disconnectPageObservers();
      
          // Re-render all pages and set up new observers
          renderAllPages().then(() => {
            // Restore the scroll position after zooming
            if (scrollPosition) {
              const pageContainer = document.getElementById(
                `page-container-${scrollPosition.pageNumber}`
              );
              if (pageContainer) {
                pageContainer.scrollIntoView();
                window.scrollBy(0, scrollPosition.offsetWithinPage);
              }
            }
          });          
          
            
        }
      };

      // Adjusted zoomIn function
      $scope.zoomIn = function () {
        const newZoom = Math.min($scope.zoomLevel * 100 + 10, 800);
        $scope.setZoom(newZoom);
      };

      // Adjusted zoomOut function
      $scope.zoomOut = function () {
        const newZoom = Math.max($scope.zoomLevel * 100 - 10, 10);
        $scope.setZoom(newZoom);
      };

      $scope.resetZoom = function () {
        $scope.zoomLevel = $scope.defaultZoomLevel;
        pageCache = {}; // Clear the cache
        // Disconnect observers and re-render all pages
        disconnectPageObservers();
        renderAllPages();                  
      };

      $scope.togglePageFitWidth = function () {
        if ($scope.isSetPageWidth) {
          $scope.setPageFit();
        } else {
          $scope.setPageWidth();
        }
        $scope.isSetPageWidth = !$scope.isSetPageWidth;
      };

      // Function to set the page width
      $scope.setPageWidth = function () {
        const viewerContainer = document.getElementById("pdf-viewer-container");
        const viewerWidth = viewerContainer.clientWidth;
        const pageWidth = 612; // Assuming a standard page width of 612 points (8.5 inches)
        const scale = viewerWidth / pageWidth;
        $scope.zoomLevel = scale;
        $scope.setZoom(scale * 100);
      };

      // Function to set the page fit
      $scope.setPageFit = function () {
        const viewerContainer = document.getElementById("pdf-viewer");
        const viewerHeight = viewerContainer.clientHeight;
        const viewerWidth = viewerContainer.clientWidth;
        const pageWidth = 612; // Assuming a standard page width of 612 points (8.5 inches)
        const pageHeight = 792; // Assuming a standard page height of 792 points (11 inches)
        const scaleWidth = viewerWidth / pageWidth;
        const scaleHeight = viewerHeight / pageHeight;
        const scale = Math.min(scaleWidth, scaleHeight);
        $scope.zoomLevel = scale;
        console.log("zoomLevel", $scope.zoomLevel, "scale:", scale);
        $scope.setZoom(scale * 100); // Set the zoom level to fit the page width
      };

      // Function to toggle full-screen mode
      $scope.toggleFullScreen = function () {
        $scope.isMaximized = !$scope.isMaximized;
        if (!document.fullscreenElement) {
          enterFullScreen(document.documentElement);
        } else {
          exitFullScreen();
        }
      };

      function enterFullScreen(element) {
        if (element.requestFullscreen) {
          element.requestFullscreen();
        } else if (element.mozRequestFullScreen) {
          // Firefox
          element.mozRequestFullScreen();
        } else if (element.webkitRequestFullscreen) {
          // Chrome, Safari and Opera
          element.webkitRequestFullscreen();
        } else if (element.msRequestFullscreen) {
          // IE/Edge
          element.msRequestFullscreen();
        }
      }

      function exitFullScreen() {
        if (document.exitFullscreen) {
          document.exitFullscreen();
        } else if (document.mozCancelFullScreen) {
          // Firefox
          document.mozCancelFullScreen();
        } else if (document.webkitExitFullscreen) {
          // Chrome, Safari and Opera
          document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) {
          // IE/Edge
          document.msExitFullscreen();
        }
      }

      // Function to process annotations and overlay clickable elements
      function processAnnotations(
        page,
        viewport,
        annotations,
        pageNumber,
        canvas
      ) {
        const annotationLayerDiv = document.createElement("div");
        annotationLayerDiv.className = "annotationLayer";
        annotationLayerDiv.style.position = "absolute";
        annotationLayerDiv.style.top = "0";
        annotationLayerDiv.style.left = "0";
        annotationLayerDiv.style.width = `${viewport.width}px`;
        annotationLayerDiv.style.height = `${viewport.height}px`;
        annotationLayerDiv.style.pointerEvents = "none"; // Allow clicks to pass through except on links

        annotations.forEach(function (annotation) {
          if (annotation.subtype === "Link") {
            const link = document.createElement("a");
            link.style.position = "absolute";
            link.style.border = "1px solid transparent"; // Optional: Visualize the link area
            link.style.pointerEvents = "auto"; // Enable pointer events for links

            // Transform the annotation's rectangle to viewport coordinates
            const [x1, y1, x2, y2] = viewport.convertToViewportRectangle(
              annotation.rect
            );
            const rect = {
              left: Math.min(x1, x2),
              top: Math.min(y1, y2),
              width: Math.abs(x1 - x2),
              height: Math.abs(y1 - y2),
            };

            // Set the link's position and size
            link.style.left = `${rect.left}px`;
            link.style.top = `${rect.top}px`;
            link.style.width = `${rect.width}px`;
            link.style.height = `${rect.height}px`;

            if (annotation.dest) {
              // Internal link
              link.href = "#";
              link.addEventListener("click", function (event) {
                event.preventDefault();
                navigateToDestination(annotation.dest);
              });
            } else if (annotation.url) {
              // External link
              link.href = annotation.url;
              link.target = "_blank";
            }

            annotationLayerDiv.appendChild(link);
          }
        });

        // Wrap canvas and annotation layer
        const canvasWrapper = document.createElement("div");
        canvasWrapper.style.position = "relative";
        canvasWrapper.appendChild(canvas); // Use the canvas passed as an argument
        canvasWrapper.appendChild(annotationLayerDiv);

        // Replace the existing canvas with the canvas wrapper
        const viewer = document.getElementById("pdf-viewer");
        viewer.innerHTML = ""; // Clear existing content
        viewer.appendChild(canvasWrapper);
      }

      // Function to navigate to a destination in the PDF from clickable toc pdf page
      function navigateToDestination(dest) {
        if (!dest) {
          console.error("Destination is null");
          return;
        }
        //console.log("Destination:", dest);

        let destinationPromise;

        if (typeof dest === "string") {
          destinationPromise = pdfDoc.getDestination(dest);
        } else {
          destinationPromise = Promise.resolve(dest);
        }

        destinationPromise
          .then(function (destArray) {
            if (!destArray) {
              console.error("Destination not found:", dest);
              return;
            }

            const destRef = destArray[0]; // The first element is the page reference
            pdfDoc
              .getPageIndex(destRef)
              .then(function (pageIndex) {
                const pageNumber = pageIndex + 1; // Page index is zero-based
                $scope.currentPage = pageNumber;
               // In all-pages mode, scroll to the page
               $timeout(function () {
                const pageContainer = document.getElementById(
                  `page-container-${pageNumber}`
                );
                if (pageContainer) {
                  pageContainer.scrollIntoView({ behavior: "smooth" });
                  highlightPageContainer(pageContainer, 1000);
                } else {
                  console.error(
                    "Page container not found for page",
                    pageNumber
                  );
                }
              }, 0);
                $scope.$applyAsync();
              })
              .catch(handleError);
          })
          .catch(handleError);
      }

      function renderPage(pageNumber) {
        // Show loading indicator
        return new Promise((resolve, reject) => {
          if (pageCache[pageNumber]) {
            displayPage(pageCache[pageNumber]);
            highlightSearchResult();
            resolve();
            return;
          }

          let viewer = document.getElementById("pdf-viewer");

          // Remove child nodes instead of setting innerHTML
          while (viewer.firstChild) {
            viewer.removeChild(viewer.firstChild);
          }

          pdfDoc
            .getPage(pageNumber)
            .then(function (page) {
              console.log("In renderPage(), Rendering page:", pageNumber);
              let viewport = page.getViewport({ scale: $scope.zoomLevel });
              let canvas = createCanvas(viewport, pageNumber);
              let context;
              try {
                context = canvas.getContext("2d", { willReadFrequently: true });
              } catch (e) {
                context = canvas.getContext("2d");
              }

              let renderContext = {
                canvasContext: context,
                viewport: viewport,
              };

              // Render the page
              page
                .render(renderContext)
                .promise.then(function () {
                  // Cache the canvas before processing annotations
                  pageCache[pageNumber] = canvas; // Cache the canvas

                  // Process annotations after rendering
                  page
                    .getAnnotations()
                    .then(function (annotations) {
                      processAnnotations(
                        page,
                        viewport,
                        annotations,
                        pageNumber,
                        canvas
                      );

                      // Highlight if search results exist
                      if ($scope.searchResults.length > 0) {
                        highlightSearchResult();
                      }

                      // Hide loading indicator
                      $scope.$apply(function () {
                        $scope.isLoading = false;
                      });

                      resolve(); // Resolve the promise
                    })
                    .catch(function (error) {
                      handleError(error);
                      reject(error);
                    });
                })
                .catch(function (error) {
                  handleError(error);
                  // Hide loading indicator in case of error
                  $scope.$apply(function () {
                    $scope.isLoading = false;
                  });

                  reject(error); // Reject the promise
                });
            })
            .catch(function (error) {
              handleError(error);
              // Hide loading indicator in case of error
              $scope.$apply(function () {
                $scope.isLoading = false;
              });

              reject(error); // Reject the promise
            });
        });
      }

      function createCanvas(viewport, pageNumber) {
        let canvas = document.createElement("canvas");
        canvas.id = `page-canvas-${pageNumber}`; // Set a unique ID for each canvas
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        canvas.style.width = viewport.width + "px";
        canvas.style.height = viewport.height + "px";
        return canvas;
      }

      function displayPage(canvas) {
        let viewer = document.getElementById("pdf-viewer");

        // Remove child nodes instead of setting innerHTML
        while (viewer.firstChild) {
          viewer.removeChild(viewer.firstChild);
        }

        viewer.appendChild(canvas); // Append the canvas to the viewer
      }

      // Lazy loading implementation
      function renderAllPages() {
        return new Promise((resolve, reject) => {
          //console.log("Setting up page containers for lazy loading");

          // Clear the viewer
          let viewer = document.getElementById("pdf-viewer");
          viewer.innerHTML = "";

          // Create page containers without rendering content
          for (
            let pageNumber = 1;
            pageNumber <= pdfDoc.numPages;
            pageNumber++
          ) {
            // Create a container div with a unique ID
            let pageContainer = document.createElement("div");
            pageContainer.id = "page-container-" + pageNumber;
            pageContainer.style.position = "relative";
            pageContainer.style.marginBottom = "10px";
            pageContainer.style.minHeight = "800px"; // Set a minimum height

           /* // Add double-click event listener to zoom in
            pageContainer.addEventListener("dblclick", function () {
              console.log(`renderAllPages-Double-clicked on page ${pageNumber}`);
              $scope.zoomInToPreset(pageNumber);
            });*/

            // Append the page container to the viewer
            viewer.appendChild(pageContainer);
          }

          // After setting up containers, set up the Intersection Observer
          setupPageObservers();
          resolve(); // Resolve immediately since pages will be rendered on demand
        });
      }

      function setupPageObservers() {
        const options = {
          root: null,
          rootMargin: "200px",
          threshold: 0.1,
        };

        const observer = new IntersectionObserver(onIntersection, options);

        for (let pageNumber = 1; pageNumber <= pdfDoc.numPages; pageNumber++) {
          const pageContainer = document.getElementById(
            "page-container-" + pageNumber
          );
          if (pageContainer) {
            observer.observe(pageContainer);
            pageObservers.push({ observer, pageContainer });
          }
        }
      }

      async function onIntersection(entries, observer) {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const pageContainer = entry.target;
            const pageNumber = parseInt(
              pageContainer.id.replace("page-container-", "")
            );
            if (!pageContainer.rendered) {
              await renderPageLazy(pageNumber, pageContainer);
              pageContainer.rendered = true;
              observer.unobserve(pageContainer);
            }
          }
        }
      }

      function renderPageLazy(pageNumber, pageContainer) {
        return new Promise(async (resolve, reject) => {
          if (!pageContainer) {
            console.error(
              `renderPageLazy: pageContainer is undefined for page ${pageNumber}`
            );
            resolve();
            return;
          }

          if (pageCache[pageNumber]) {
            // If the page is already cached, append the canvas
            pageContainer.appendChild(pageCache[pageNumber]);
            resolve();
            return;
          }

          try {
            const page = await pdfDoc.getPage(pageNumber);
            const viewport = page.getViewport({ scale: $scope.zoomLevel });

            // Create a canvas and render context
            const canvas = document.createElement("canvas");
            canvas.id = `page-canvas-${pageNumber}`;
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            let context;
            try {
              context = canvas.getContext("2d", { willReadFrequently: true });
            } catch (e) {
              context = canvas.getContext("2d");
            }

            const renderContext = {
              canvasContext: context,
              viewport: viewport,
            };

            // Render the page content
            await page.render(renderContext).promise;

            // Cache the rendered page and page object before processing annotations
            pageCache[pageNumber] = canvas;
            pageObjectCache[pageNumber] = page;

            // Process annotations
            const annotations = await page.getAnnotations();
            processAnnotationsLazy(
              page,
              viewport,
              annotations,
              pageNumber,
              pageContainer,
              canvas
            );

            // Highlight search results if any
            if ($scope.searchResults.length > 0) {
              await highlightSearchResultOnPage(pageNumber);
            }
           
            resolve();
          } catch (error) {
            handleError(error);
            reject(error);
          }
        });
      }

      function processAnnotationsLazy(
        page,
        viewport,
        annotations,
        pageNumber,
        pageContainer,
        canvas
      ) {
        const annotationLayerDiv = document.createElement("div");
        annotationLayerDiv.className = "annotationLayer";
        annotationLayerDiv.style.position = "absolute";
        annotationLayerDiv.style.top = "0";
        annotationLayerDiv.style.left = "0";
        annotationLayerDiv.style.width = `${viewport.width}px`;
        annotationLayerDiv.style.height = `${viewport.height}px`;
        annotationLayerDiv.style.pointerEvents = "none"; // Allow clicks to pass through except on links

        annotations.forEach(function (annotation) {
          if (annotation.subtype === "Link") {
            const link = document.createElement("a");
            link.style.position = "absolute";
            link.style.border = "1px solid transparent"; // Optional: Visualize the link area
            link.style.pointerEvents = "auto"; // Enable pointer events for links

            // Transform the annotation's rectangle to viewport coordinates
            const [x1, y1, x2, y2] = viewport.convertToViewportRectangle(
              annotation.rect
            );
            const rect = {
              left: Math.min(x1, x2),
              top: Math.min(y1, y2),
              width: Math.abs(x1 - x2),
              height: Math.abs(y1 - y2),
            };

            // Set the link's position and size
            link.style.left = `${rect.left}px`;
            link.style.top = `${rect.top}px`;
            link.style.width = `${rect.width}px`;
            link.style.height = `${rect.height}px`;

            if (annotation.dest) {
              // Internal link
              link.href = "#";
              link.addEventListener("click", function (event) {
                event.preventDefault();
                navigateToDestination(annotation.dest);
              });
            } else if (annotation.url) {
              // External link
              link.href = annotation.url;
              link.target = "_blank";
            }

            annotationLayerDiv.appendChild(link);
          }
        });

        // Wrap canvas and annotation layer
        const canvasWrapper = document.createElement("div");
        canvasWrapper.style.position = "relative";
        canvasWrapper.appendChild(canvas);
        canvasWrapper.appendChild(annotationLayerDiv);

        // Append the canvas wrapper to the page container
        pageContainer.appendChild(canvasWrapper);
      }

      function disconnectPageObservers() {
        pageObservers.forEach(({ observer, pageContainer }) => {
          observer.unobserve(pageContainer);
        });
        pageObservers = [];
      }

      $scope.firstPage = function () {
        $scope.currentPage = 1;
        // Scroll to the specific page container
        const pageContainer = document.getElementById(
          `page-container-${$scope.currentPage}`
        );
        if (pageContainer) {
          pageContainer.scrollIntoView({ behavior: "smooth" });
          highlightPageContainer(pageContainer, 1000);
        }
        $scope.showToast("At beginning of document");
      };

      $scope.prevPage = function () {
        if ($scope.currentPage > 1) {
          $scope.currentPage--;
          const pageContainer = document.getElementById(
            `page-container-${$scope.currentPage}`
          );
          if (pageContainer) {
            pageContainer.scrollIntoView({ behavior: "smooth" });
            highlightPageContainer(pageContainer, 1000);
          }
        } else {
          $scope.showToast("At beginning of document");
        }
      };

      $scope.nextPage = function () {
        if ($scope.currentPage < $scope.totalPages) {
          $scope.currentPage++;
          const pageContainer = document.getElementById(
            `page-container-${$scope.currentPage}`
          );
          if (pageContainer) {
            pageContainer.scrollIntoView({ behavior: "smooth" });
            highlightPageContainer(pageContainer, 1000);
          }
        } else {
          $scope.showToast("At end of document");
        }
      };

      $scope.lastPage = function () {
        $scope.currentPage = $scope.totalPages;
        // Scroll to the specific page container
        const pageContainer = document.getElementById(
          `page-container-${$scope.currentPage}`
        );
        if (pageContainer) {
          pageContainer.scrollIntoView({ behavior: "smooth" });
          highlightPageContainer(pageContainer, 1000);
        }
        $scope.showToast("At end of document");
      };

      $scope.goToPage = function () {
        if ($scope.gotoPageNumber >= 1 && $scope.gotoPageNumber <= $scope.totalPages + $scope.pageOffset)
          {
            $scope.currentPage = $scope.gotoPageNumber - $scope.pageOffset;
            $scope.gotoPageNumber = null; // Clear the input field
            // Scroll to the specific page container
            const pageContainer = document.getElementById(
              `page-container-${$scope.currentPage}`
            );
            if (pageContainer) {
              pageContainer.scrollIntoView({ behavior: "smooth" });
              highlightPageContainer(pageContainer, 1000);
            }
          } else {
            if ($scope.gotoPageNumber < 1) {
              $scope.firstPage();
            } else {
              $scope.lastPage();
            }
            $scope.gotoPageNumber = null; // Clear the input field
          }
      };

      // Function to navigate to a destination in the PDF from Sidebar
      $scope.goToDestination = function (dest) {
        if (!dest) {
          console.error("Destination is null");
          return;
        }
        console.log("Destination:", dest);

        let destinationPromise;

        if (typeof dest === "string") {
          destinationPromise = pdfDoc.getDestination(dest);
        } else {
          destinationPromise = Promise.resolve(dest);
        }

        destinationPromise
          .then(function (destArray) {
            if (!destArray) {
              console.error("Destination not found:", dest);
              return;
            }

            const destRef = destArray[0]; // The first element is the page reference
            pdfDoc
              .getPageIndex(destRef)
              .then(function (pageIndex) {
                const pageNumber = pageIndex + 1; // Page index is zero-based
                $scope.currentPage = pageNumber;
                 // In all pages mode, scroll to the desired page
                 $timeout(function () {
                  const pageContainer = document.getElementById(
                    "page-container-" + pageNumber
                  );
                  if (pageContainer) {
                    pageContainer.scrollIntoView({ behavior: "smooth" });
                    // Optionally, highlight the target page
                    highlightPageContainer(pageContainer, 1000);
                  } else {
                    console.error(
                      "Page container not found for page",
                      pageNumber
                    );
                  }
                }, 0);
                $scope.$applyAsync();
              })
              .catch(handleError);
          })
          .catch(handleError);
      };

      // Debounce search input
      let searchTimeout;
      $scope.search = function () {
        isSearch = true;
        console.log(
          "Searching for:",
          $scope.searchText,
          " Display mode:",
          $scope.displayMode
        );
        if (searchTimeout) {
          $timeout.cancel(searchTimeout);
        }
        searchTimeout = $timeout(function () {
          if (!$scope.searchText) return;
          const searchText = $scope.searchText.toLowerCase();
          const searchRegex = new RegExp(searchText, "gi"); // Global, case-insensitive match
          $scope.searchResults = [];
          $scope.currentSearchResultIndex = -1;

          let promises = [];

          // Create measurement canvas and context once
          const measurementCanvas = document.createElement("canvas");
          const ctx = measurementCanvas.getContext("2d");
          ctx.font = "11px Calibri, Arial, sans-serif"; // Set font once

          // Prepare pages to search
          for (let i = 1; i <= pdfDoc.numPages; i++) {
            promises.push(
              pdfDoc.getPage(i).then(function (page) {
                return page
                  .getTextContent()
                  .then(function (textContent) {
                    let textItems = textContent.items;

                    textItems.forEach(function (textItem) {
                      let text = textItem.str;
                      let textLength = text.length;

                      let matches;
                      while (
                        (matches = searchRegex.exec(text.toLowerCase())) !==
                        null
                      ) {
                        let matchIndex = matches.index;
                        let matchedTextLength = matches[0].length;

                        // Extend the match by one character if possible
                        let extendedMatchEnd =
                          matchIndex + matchedTextLength + 1;
                        if (extendedMatchEnd > textLength) {
                          extendedMatchEnd = textLength;
                        }
                        let extendedMatchedText = text.substring(
                          matchIndex,
                          extendedMatchEnd
                        );

                        // Measure text widths
                        const textBeforeMatch = text.substring(0, matchIndex);
                        const widthBeforeMatch =
                          ctx.measureText(textBeforeMatch).width;
                        const widthMatchedText =
                          ctx.measureText(extendedMatchedText).width;

                        // Transform the x position
                        let tx = textItem.transform[4] + widthBeforeMatch;

                        // Adjust the y position
                        let ty = textItem.transform[5] - 2; // Adjust as needed

                        $scope.searchResults.push({
                          page: i,
                          x: tx,
                          y: ty,
                          width: widthMatchedText,
                          height: 11, // Known font size
                        });
                      }
                    });
                  })
                  .catch(handleError);
              })
            );
          }

          Promise.all(promises)
            .then(function () {
              if ($scope.searchResults.length > 0) {
                $scope.currentSearchResultIndex = 0;
                // Define firstResult here
                // In all pages mode
                const result =
                $scope.searchResults[$scope.currentSearchResultIndex];
              const pageNumber = result.page;
              const pageContainer = document.getElementById(
                `page-container-${pageNumber}`
              );
              if (pageContainer) {
                // Check if the page is rendered
                if (pageContainer.rendered) {
                  pageContainer.scrollIntoView({ behavior: "smooth" });
                  highlightSearchResultOnPage(pageNumber);
                } else {
                  // Render the page first
                  renderPageLazy(pageNumber, pageContainer).then(
                    function () {
                      pageContainer.rendered = true;
                      pageContainer.scrollIntoView({ behavior: "smooth" });
                      highlightSearchResultOnPage(pageNumber);
                    }
                  );
                }
                highlightPageContainer(pageContainer, 500);
              } else {
                console.error(
                  "Page container not found for page",
                  pageNumber
                );
              }
              } else {
                $scope.showToast("Search text not found. Try again.");
                $scope.isSearch = false;
              }
              $scope.$apply(function () {
                $scope.isLoading = false; // Hide loading indicator in case of error
                $scope.isSearch = false;
              });
            })
            .catch(handleError);
        }, 300); // Debounce time in milliseconds
      };

      $scope.nextSearchResult = function () {
        if ($scope.currentSearchResultIndex < $scope.searchResults.length - 1) {
          $scope.currentSearchResultIndex++;
          const result = $scope.searchResults[$scope.currentSearchResultIndex];
          // In all page mode
          const pageNumber = result.page;
          const pageContainer = document.getElementById(
            `page-container-${pageNumber}`
          );
          if (pageContainer) {
            // Check if the page is rendered
            if (pageContainer.rendered) {
              pageContainer.scrollIntoView({ behavior: "smooth" });
              highlightSearchResultOnPage(pageNumber);
            } else {
              // Render the page first
              renderPageLazy(pageNumber, pageContainer).then(function () {
                pageContainer.rendered = true;
                pageContainer.scrollIntoView({ behavior: "smooth" });
                highlightSearchResultOnPage(pageNumber);
              });
            }
            highlightPageContainer(pageContainer, 500);
          } else {
            console.error("Page container not found for page", pageNumber);
          }
        } else {
          // If the last search result is reached, show a toast message
          $scope.showToast("End of search results");
        }
      };

      $scope.prevSearchResult = function () {
        if ($scope.currentSearchResultIndex > 0) {
          $scope.currentSearchResultIndex--;
          const result = $scope.searchResults[$scope.currentSearchResultIndex];
          // In all page mode
          const pageNumber = result.page;
          const pageContainer = document.getElementById(
            `page-container-${pageNumber}`
          );
          if (pageContainer) {
            // Check if the page is rendered
            if (pageContainer.rendered) {
              pageContainer.scrollIntoView({ behavior: "smooth" });
              highlightSearchResultOnPage(pageNumber);
            } else {
              // Render the page first
              renderPageLazy(pageNumber, pageContainer).then(function () {
                pageContainer.rendered = true;
                pageContainer.scrollIntoView({ behavior: "smooth" });
                highlightSearchResultOnPage(pageNumber);
              });
            }
            highlightPageContainer(pageContainer, 500);
          } else {
            console.error("Page container not found for page", pageNumber);
          }
        } else {
          // If the first search result is reached, show a toast message
          $scope.showToast("Beginning of search results");
        }
      };

      // for search input
      $scope.checkEnter = function (event) {
        if (event.keyCode === 13) {
          // Enter key code
          let searchText = $scope.searchText;
          $scope.clearSearch();
          $scope.searchText = searchText;
          $scope.search();
          $scope.selectText(event);
        }
      };

      // for go to page input
      $scope.checkEnterGoToPage = function (event) {
        if (event.keyCode === 13) {
          // Enter key code
          $scope.goToPage();
          // Call selectText to select the text in the input field
          $scope.selectText(event);
        }
      };

      $scope.selectText = function (event) {
        event.target.select();
      };

      $scope.clearSearch = function () {
        $scope.searchText = "";
        $scope.searchResults = [];
        $scope.currentSearchResultIndex = -1;
        pageCache = {}; // Clear the cache


        // Re-render the current page to remove highlights
        // Disconnect observers and re-render all pages
        disconnectPageObservers();
        renderAllPages();
        
        // Focus the search input after clearing the search
        $timeout(function () {
          var searchInput = $document[0].querySelector(
            'input[ng-model="searchText"]'
          );
          if (searchInput) {
            searchInput.focus();
          }
        }, 0);
      };

      function handleError(error) {
        console.error("Error:", error);
        $scope.showToast("Error: " + error.message);
        $scope.isLoading = false; // Hide loading indicator in case of error
      }

      function highlightPageContainer(pageContainer, timeout = 1000) {
        // Highlight the page container
        pageContainer.style.transition = "background-color 0.5s";
        pageContainer.style.backgroundColor = "rgba(0, 255, 0, 0.5)"; // green highlight

        // Remove the highlight after a short delay
        setTimeout(function () {
          pageContainer.style.backgroundColor = "";
        }, timeout);
      }

      async function highlightSearchResult() {
        try {
          if (
            $scope.currentSearchResultIndex >= 0 &&
            $scope.currentSearchResultIndex < $scope.searchResults.length
          ) {
            const result =
              $scope.searchResults[$scope.currentSearchResultIndex];

              const pageContainer = document.getElementById(
                `page-container-${result.page}`
              );
              if (pageContainer) {
                pageContainer.scrollIntoView({ behavior: "smooth" });
                await highlightSearchResultOnPage(result.page);
              }
          }
        } catch (error) {
          handleError(
            new Error(`Error in highlightSearchResult: ${error.message}`)
          );
        }
      }

      // Assuming this function is part of your PdfController
      $scope.onScroll = function () {
        var viewerContainer = document.getElementById("pdf-viewer"); // the container for the PDF
        var pages = viewerContainer.querySelectorAll("canvas"); // all rendered pages

        // Find the page currently in view
        pages.forEach(function (page, index) {
          var pageTop = page.getBoundingClientRect().top;
          var containerTop = viewerContainer.getBoundingClientRect().top;

          // If the page's top is within the viewable container, it is the current page
          if (
            pageTop >= containerTop &&
            pageTop < containerTop + viewerContainer.clientHeight
          ) {
            // Update the currentPage when it's in view
            $scope.currentPage = index + 1;
            $scope.$apply(); // Ensure the scope is updated
          }
        });
      };

      // Add scroll event listener for the PDF viewer
      document
        .getElementById("pdf-viewer")
        .addEventListener("scroll", $scope.onScroll);

      async function highlightSearchResultOnPage(pageNumber) {
        return new Promise(async (resolve, reject) => {
          const resultsOnPage = $scope.searchResults.filter(
            (result) => result.page === pageNumber
          );

          if (resultsOnPage.length === 0) {
            resolve();
            return;
          }

          const canvas = document.getElementById(`page-canvas-${pageNumber}`);
          if (!canvas) {
            resolve();
            return;
          }

          // Check if the canvas is currently rendering
          if ($scope.canvasIsRendering) {
            // Wait for the current rendering to complete before proceeding
            setTimeout(() => {
              highlightSearchResultOnPage(pageNumber)
                .then(resolve)
                .catch(reject);
            }, 50); // Adjust the delay as needed
            return;
          }

          const context = canvas.getContext("2d");

          try {
            let page = pageObjectCache[pageNumber];
            if (!page) {
              page = await pdfDoc.getPage(pageNumber);
              pageObjectCache[pageNumber] = page;
            }
            const viewport = page.getViewport({ scale: $scope.zoomLevel });

            // Set the rendering flag to true
            $scope.canvasIsRendering = true;

            // Restore the original image data if available
            if (canvas.originalImageData) {
              context.putImageData(canvas.originalImageData, 0, 0);
            } else {
              // Render the page and cache the image data
              await page.render({ canvasContext: context, viewport: viewport })
                .promise;
              canvas.originalImageData = context.getImageData(
                0,
                0,
                canvas.width,
                canvas.height
              );
            }

            // Draw the highlights
            resultsOnPage.forEach((result) => {
              // Convert PDF rectangle to viewport rectangle
              let [x1, y1, x2, y2] = viewport.convertToViewportRectangle([
                result.x,
                result.y,
                result.x + result.width,
                result.y + result.height,
              ]);

              // Adjust for canvas coordinate system
              let rectX = x1;
              let rectY = Math.min(y1, y2);
              let rectWidth = x2 - x1;
              let rectHeight = Math.abs(y2 - y1);

              context.save();
              if (
                $scope.searchResults[$scope.currentSearchResultIndex] === result
              ) {
                context.fillStyle = "rgba(0, 255, 0, 0.5)"; // Green for current result
              } else {
                context.fillStyle = "rgba(255, 255, 0, 0.5)"; // Yellow for others
              }
              context.fillRect(rectX, rectY, rectWidth, rectHeight);
              context.restore();
            });

            // Set the rendering flag to false
            $scope.canvasIsRendering = false;

            resolve();
          } catch (error) {
            // Set the rendering flag to false in case of error
            $scope.canvasIsRendering = false;
            handleError(error);
            reject(error);
          }
        });
      }
    }
  );
